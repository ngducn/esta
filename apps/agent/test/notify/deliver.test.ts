import { describe, expect, it } from 'vitest';
import { deliverPending, INTERRUPTED_ERROR } from '../../src/notify/deliver';
import type { DeliveryConfig, Mailer, OutgoingMail } from '../../src/notify/smtp';
import { fakeDb } from '../../src/test/fake-db';
import { clockOn } from '../full-seed';

type Row = Record<string, unknown>;

const H = 'h1';
const CONFIG: DeliveryConfig = { smtpUrl: 'smtp://127.0.0.1:2500', appUrl: 'http://127.0.0.1:3700', from: 'Esta <esta@esta.localhost>' };
const clock = clockOn('2026-10-07T07:05:00+07:00');

const item = (id: string, patch: Row = {}): Row => ({ id, household_id: H, kind: 'alert', severity: 'action', audience: 'all', title: `Ghi chú ${id}`, dedupe_key: `k:${id}`, status: 'new', created_at: '2026-10-07T00:00:10.000Z', ...patch });
const brief = item('brief', { kind: 'brief', severity: 'info', title: 'Hôm nay có hai việc cần làm', dedupe_key: 'brief:2026-10-07' });

function world(items: Row[], cap: number | null = 10) {
  return {
    agent_items: items,
    household_members: [{ id: 'm1', household_id: H, user_id: 'u1', invited_email: 'me.lane2@demo.esta.test', is_operator: false, locale: 'vi' }],
    notification_preferences: [{ member_id: 'm1', household_id: H, channel: 'email', kinds: ['brief', 'action'], daily_cap: cap }],
    notifications: [] as Row[],
  };
}

function inbox(failures = 0): { mailer: Mailer; sent: OutgoingMail[]; attempts: () => number } {
  const sent: OutgoingMail[] = [];
  let attempts = 0;
  return {
    sent,
    attempts: () => attempts,
    mailer: {
      async send(mail) {
        attempts += 1;
        if (attempts <= failures) throw new Error('connect ECONNREFUSED 127.0.0.1:2500');
        sent.push(mail);
      },
    },
  };
}

describe('deliverPending', () => {
  it('sends a brief notice and an action notice, and none for a watch note', async () => {
    const tables = world([brief, item('a1'), item('w1', { severity: 'watch' })]);
    const box = inbox();
    expect(await deliverPending(fakeDb(tables), box.mailer, CONFIG, await clock())).toBe(2);
    expect(box.sent.map((mail) => mail.subject).toSorted()).toEqual(['Trợ lý có ghi chú mới cần xem', 'Trợ lý: Ghi chú buổi sáng 07/10/2026']);
    expect(box.sent.every((mail) => mail.to === 'me.lane2@demo.esta.test' && mail.text.includes('http://127.0.0.1:3700/assistant?note='))).toBe(true);
    expect(tables.notifications.map((row) => row.status)).toEqual(['sent', 'sent']);
  });

  it('sends nothing a second time when it runs again, as after a restart', async () => {
    const tables = world([brief]);
    const box = inbox();
    await deliverPending(fakeDb(tables), box.mailer, CONFIG, await clock());
    await deliverPending(fakeDb(tables), box.mailer, CONFIG, await clock());
    expect(box.sent).toHaveLength(1);
    expect(tables.notifications).toHaveLength(1);
  });

  const at = (iso: string) => clockOn(iso)();

  it('marks a refused send failed with its error, and sends it once the backoff has passed', async () => {
    const tables = world([brief]);
    const box = inbox(1);
    await deliverPending(fakeDb(tables), box.mailer, CONFIG, await clock());
    expect(tables.notifications[0]).toMatchObject({ status: 'failed', error: 'connect ECONNREFUSED 127.0.0.1:2500', attempts: 1 });
    await deliverPending(fakeDb(tables), box.mailer, CONFIG, await at('2026-10-07T07:05:30+07:00'));
    expect(tables.notifications[0]).toMatchObject({ status: 'failed', attempts: 1 });
    await deliverPending(fakeDb(tables), box.mailer, CONFIG, await at('2026-10-07T07:06:10+07:00'));
    expect(tables.notifications[0]).toMatchObject({ status: 'sent', error: null, attempts: 2 });
    expect(box.sent).toHaveLength(1);
  });

  it('backs off 1, 2, 4 minutes up to 30, so a 40 minute outage still delivers exactly one copy', async () => {
    const tables = world([brief]);
    const box = inbox(1000);
    const tried: number[] = [];
    for (let minute = 0; minute <= 40; minute += 1) {
      const before = box.attempts();
      await deliverPending(fakeDb(tables), box.mailer, CONFIG, await at(new Date(Date.parse('2026-10-07T07:05:00+07:00') + minute * 60_000).toISOString()));
      if (box.attempts() > before) tried.push(minute);
    }
    expect(tried).toEqual([0, 1, 3, 7, 15, 31]);
    const recovered = inbox();
    await deliverPending(fakeDb(tables), recovered.mailer, CONFIG, await at('2026-10-07T07:45:00+07:00'));
    expect(recovered.sent).toHaveLength(0);
    await deliverPending(fakeDb(tables), recovered.mailer, CONFIG, await at('2026-10-07T08:10:00+07:00'));
    expect(recovered.sent).toHaveLength(1);
    await deliverPending(fakeDb(tables), recovered.mailer, CONFIG, await at('2026-10-07T09:00:00+07:00'));
    expect(recovered.sent).toHaveLength(1);
    expect(tables.notifications[0]?.status).toBe('sent');
  });

  it('gives up on a notice once it is 24 hours old', async () => {
    const tables = world([brief]);
    const box = inbox(1000);
    await deliverPending(fakeDb(tables), box.mailer, CONFIG, await clock());
    const queuedAt = Date.parse(String(tables.notifications[0]?.created_at));
    const attempts = box.attempts();
    await deliverPending(fakeDb(tables), box.mailer, CONFIG, await at(new Date(queuedAt + 24 * 3_600_000 + 60_000).toISOString()));
    expect(box.attempts()).toBe(attempts);
    expect(tables.notifications[0]?.status).toBe('failed');
  });

  it('marks a notice a crash left in sending as interrupted and does not resend it', async () => {
    const tables = world([brief]);
    tables.notifications.push({ id: 'n1', household_id: H, user_id: 'u1', agent_item_id: 'brief', channel: 'email', status: 'sending', attempts: 1, created_at: '2026-10-07T00:00:20.000Z', last_attempt_at: '2026-10-07T00:00:30.000Z' });
    const box = inbox();
    await deliverPending(fakeDb(tables), box.mailer, CONFIG, await clock());
    await deliverPending(fakeDb(tables), box.mailer, CONFIG, await at('2026-10-07T09:00:00+07:00'));
    expect(tables.notifications[0]).toMatchObject({ status: 'failed', error: INTERRUPTED_ERROR });
    expect(box.sent).toHaveLength(0);
  });

  it('leaves a notice claimed a moment ago alone', async () => {
    const tables = world([brief]);
    tables.notifications.push({ id: 'n1', household_id: H, user_id: 'u1', agent_item_id: 'brief', channel: 'email', status: 'sending', attempts: 1, created_at: '2026-10-07T00:00:20.000Z', last_attempt_at: '2026-10-07T00:04:30.000Z' });
    await deliverPending(fakeDb(tables), inbox().mailer, CONFIG, await clock());
    expect(tables.notifications[0]?.status).toBe('sending');
  });

  it('queues past the daily cap as skipped and sends only the first notices', async () => {
    const tables = world([item('a1'), item('a2', { created_at: '2026-10-07T00:00:20.000Z' }), item('a3', { created_at: '2026-10-07T00:00:30.000Z' })], 2);
    const box = inbox();
    await deliverPending(fakeDb(tables), box.mailer, CONFIG, await clock());
    expect(box.sent).toHaveLength(2);
    expect(tables.notifications.map((row) => row.status).toSorted()).toEqual(['sent', 'sent', 'skipped']);
    await deliverPending(fakeDb(tables), box.mailer, CONFIG, await clock());
    expect(box.sent).toHaveLength(2);
  });

  it('counts the cap per business day, so a notice at 00:01 the next day is not capped by yesterday', async () => {
    const tables = world([item('a1', { created_at: '2026-10-07T16:50:00.000Z' })], 1);
    tables.notifications.push({ id: 'n0', household_id: H, user_id: 'u1', agent_item_id: 'old', channel: 'email', status: 'sent', attempts: 1, created_at: '2026-10-07T16:30:00.000Z' });
    const box = inbox();
    await deliverPending(fakeDb(tables), box.mailer, CONFIG, await clockOn('2026-10-08T00:01:00+07:00')());
    expect(box.sent).toHaveLength(1);
  });

  it('sends a member who left the kind out nothing, and an English member English chrome', async () => {
    const tables = world([item('a1')]);
    tables.notification_preferences[0] = { ...tables.notification_preferences[0], kinds: ['brief'] } as never;
    const box = inbox();
    await deliverPending(fakeDb(tables), box.mailer, CONFIG, await clock());
    expect(box.sent).toEqual([]);
    expect(tables.notifications).toEqual([]);

    const english = world([item('a1')]);
    english.household_members[0] = { ...english.household_members[0], locale: 'en' } as never;
    await deliverPending(fakeDb(english), box.mailer, CONFIG, await clock());
    expect(box.sent[0]?.subject).toBe('The assistant left a new note to look at');
  });
});
