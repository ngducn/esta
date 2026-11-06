import type { Clock } from '@esta/core';
import { z } from 'zod';
import { addDays } from '@esta/core/date/calendar';
import { isIsoDate, type IsoDate } from '@esta/core/date';
import { renderNoticeEmail } from '@esta/core/email';
import { noticeKind, recipientsFor, type NoticeKind, type NoticeMember, type NoticePreference } from '@esta/core/notify';
import type { AgentDb } from '../supabase';
import type { DeliveryConfig, Mailer } from './smtp';

/** A notice that keeps failing stops after this many tries, so a dead address cannot loop forever. */
export const MAX_SEND_ATTEMPTS = 30;
/** A note older than this when the worker first sees it is not announced, so turning notices on never mails last week. */
const NEW_NOTE_WINDOW_MS = 6 * 60 * 60 * 1000;
const ERROR_LIMIT = 300;

const itemRow = z.object({
  id: z.string(),
  household_id: z.string(),
  kind: z.string(),
  severity: z.enum(['info', 'watch', 'action']),
  audience: z.enum(['all', 'operator']),
  title: z.string(),
  dedupe_key: z.string(),
  created_at: z.string(),
});
const memberRow = z.object({ id: z.string(), household_id: z.string(), user_id: z.string().nullable(), invited_email: z.string(), is_operator: z.boolean(), locale: z.enum(['vi', 'en']) });
type ItemRow = z.infer<typeof itemRow>;

const ITEM_COLUMNS = 'id, household_id, kind, severity, audience, title, dedupe_key, created_at';
const MEMBER_COLUMNS = 'id, household_id, user_id, invited_email, is_operator, locale';

const startOfDay = (day: IsoDate) => `${day}T00:00:00+07:00`;

async function read<T>(label: string, query: PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>, row: z.ZodType<T>): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new Error(`Reading ${label} failed: ${error.message}`);
  return (data ?? []).map((value) => row.parse(value));
}

/** Queues a notice row for each member who should hear of a recent brief or action note, once per member, note and channel. */
async function queueNotices(db: AgentDb, clock: Clock): Promise<void> {
  const today = clock.today();
  const since = new Date(Date.parse(clock.now()) - NEW_NOTE_WINDOW_MS).toISOString();
  const items = (await read('the recent notes', db.from('agent_items').select(ITEM_COLUMNS).eq('status', 'new').gte('created_at', since).order('created_at'), itemRow)).filter(
    (item) => noticeKind(item) !== null,
  );
  if (items.length === 0) return;
  const households = [...new Set(items.map((item) => item.household_id))];
  const members = await read('the members', db.from('household_members').select(MEMBER_COLUMNS).in('household_id', households), memberRow);
  const preferences = await read(
    'the notification preferences',
    db.from('notification_preferences').select('member_id, channel, kinds, daily_cap').in('household_id', households),
    z.object({ member_id: z.string(), channel: z.enum(['inapp', 'email', 'push']), kinds: z.array(z.string()), daily_cap: z.number().nullable() }),
  );
  const existing = await read(
    'the notices',
    db.from('notifications').select('user_id, agent_item_id, status, created_at').eq('channel', 'email').in('household_id', households).gte('created_at', since),
    z.object({ user_id: z.string(), agent_item_id: z.string(), status: z.string(), created_at: z.string() }),
  );
  const dayStart = Date.parse(startOfDay(today));
  const dayEnd = Date.parse(startOfDay(addDays(today, 1)));
  const counted = new Map<string, number>();
  for (const row of existing) {
    const at = Date.parse(row.created_at);
    if (row.status === 'skipped' || at < dayStart || at >= dayEnd) continue;
    counted.set(row.user_id, (counted.get(row.user_id) ?? 0) + 1);
  }
  const already = new Set(existing.map((row) => `${row.user_id}:${row.agent_item_id}`));
  const now = clock.now();
  const rows: Array<{ household_id: string; user_id: string; agent_item_id: string; channel: 'email'; status: 'queued' | 'skipped'; attempts: 0; created_at: string }> = [];
  for (const item of items) {
    const household = members.filter((member) => member.household_id === item.household_id);
    const notice: NoticeMember[] = household.map((member) => ({ id: member.id, userId: member.user_id, isOperator: member.is_operator }));
    const wants: NoticePreference[] = preferences.map((row) => ({ memberId: row.member_id, channel: row.channel, kinds: row.kinds, dailyCap: row.daily_cap }));
    const sentToday = new Map(household.flatMap((member) => (member.user_id === null ? [] : [[member.id, counted.get(member.user_id) ?? 0] as const])));
    for (const recipient of recipientsFor(item, notice, wants, sentToday)) {
      const member = household.find(({ id }) => id === recipient.memberId);
      if (member?.user_id == null || already.has(`${member.user_id}:${item.id}`)) continue;
      rows.push({ household_id: item.household_id, user_id: member.user_id, agent_item_id: item.id, channel: 'email', status: recipient.status, attempts: 0, created_at: now });
      if (recipient.status === 'queued') counted.set(member.user_id, (counted.get(member.user_id) ?? 0) + 1);
    }
  }
  if (rows.length === 0) return;
  const { error } = await db.from('notifications').upsert(rows, { onConflict: 'user_id,agent_item_id,channel', ignoreDuplicates: true });
  if (error) throw new Error(`Queueing the notices failed: ${error.message}`);
}

function briefDay(item: ItemRow, fallback: IsoDate): IsoDate {
  const day = item.dedupe_key.startsWith('brief:') ? item.dedupe_key.slice('brief:'.length) : '';
  return isIsoDate(day) ? day : fallback;
}

/** Sends the queued and failed email notices, each claimed first so two workers never send one twice. Returns how many went out. */
async function sendQueued(db: AgentDb, mailer: Mailer, config: DeliveryConfig, clock: Clock): Promise<number> {
  const pending = await read(
    'the pending notices',
    db.from('notifications').select('id, user_id, agent_item_id, household_id, status, attempts').eq('channel', 'email').in('status', ['queued', 'failed']).lt('attempts', MAX_SEND_ATTEMPTS).order('created_at'),
    z.object({ id: z.string(), user_id: z.string(), agent_item_id: z.string(), household_id: z.string(), status: z.enum(['queued', 'failed']), attempts: z.number() }),
  );
  let sent = 0;
  for (const notice of pending) {
    const claim = await db.from('notifications').update({ status: 'sending', attempts: notice.attempts + 1 }).eq('id', notice.id).eq('status', notice.status).select('id');
    if (claim.error) throw new Error(`Claiming a notice failed: ${claim.error.message}`);
    if (claim.data.length === 0) continue;
    try {
      const [item] = await read('the note', db.from('agent_items').select(ITEM_COLUMNS).eq('id', notice.agent_item_id), itemRow);
      const [member] = await read('the member', db.from('household_members').select(MEMBER_COLUMNS).eq('household_id', notice.household_id).eq('user_id', notice.user_id), memberRow);
      const kind: NoticeKind | null = item === undefined ? null : noticeKind(item);
      if (item === undefined || member === undefined || kind === null) throw new Error('The note or the member is gone');
      const mail = renderNoticeEmail({ id: item.id, kind, title: item.title, date: briefDay(item, clock.today()) }, member.locale, config.appUrl);
      await mailer.send({ from: config.from, to: member.invited_email, ...mail });
      const done = await db.from('notifications').update({ status: 'sent', sent_at: clock.now(), error: null }).eq('id', notice.id);
      if (done.error) throw new Error(`Marking a notice sent failed: ${done.error.message}`);
      sent += 1;
    } catch (error) {
      const message = (error instanceof Error ? error.message : String(error)).slice(0, ERROR_LIMIT);
      await db.from('notifications').update({ status: 'failed', error: message }).eq('id', notice.id);
    }
  }
  return sent;
}

/** Queues what is owed and sends it; run after a job commits and on every scheduler tick. Rerunning sends nothing twice (PLT-4). */
export async function deliverPending(db: AgentDb, mailer: Mailer, config: DeliveryConfig, clock: Clock): Promise<number> {
  await queueNotices(db, clock);
  return sendQueued(db, mailer, config, clock);
}
