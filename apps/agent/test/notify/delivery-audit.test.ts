import { describe, expect, it } from 'vitest';
import { deliverPending } from '../../src/notify/deliver';
import { type DeliveryConfig, type Mailer, type OutgoingMail } from '../../src/notify/smtp';
import { fakeDb } from '../../src/test/fake-db';
import { clockOn } from '../full-seed';

type Row = Record<string, unknown>;
const H = 'h1';
const CONFIG: DeliveryConfig = { smtpUrl: 'smtp://127.0.0.1:2500', appUrl: 'http://127.0.0.1:3700', from: 'Esta <esta@esta.localhost>' };
const item = (id: string, patch: Row = {}): Row => ({ id, household_id: H, kind: 'alert', severity: 'action', audience: 'all', title: `Ghi chú ${id}`, dedupe_key: `k:${id}`, status: 'new', created_at: '2026-10-07T00:00:10.000Z', ...patch });
const world = (items: Row[], cap: number | null) => ({
  agent_items: items,
  household_members: [{ id: 'm1', household_id: H, user_id: 'u1', invited_email: 'me.lane2@demo.esta.test', is_operator: false, locale: 'vi' }],
  notification_preferences: [{ member_id: 'm1', household_id: H, channel: 'email', kinds: ['brief', 'action'], daily_cap: cap }],
  notifications: [] as Row[],
});
const inbox = () => {
  const sent: OutgoingMail[] = [];
  const mailer: Mailer = { async send(mail) { sent.push(mail); } };
  return { sent, mailer };
};

describe('delivery audit', () => {
  it('daily cap counts every notice of the Ho Chi Minh day, not only the last six hours', async () => {
    // cap 1; one notice already went out at 07:10 local; a new action note lands at 14:00 local
    const tables = world([item('a2', { created_at: '2026-10-07T07:00:00.000Z' })], 1);
    tables.notifications.push({ id: 'n0', household_id: H, user_id: 'u1', agent_item_id: 'a1', channel: 'email', status: 'sent', attempts: 1, created_at: '2026-10-07T00:10:00.000Z' });
    const box = inbox();
    await deliverPending(fakeDb(tables), box.mailer, CONFIG, await clockOn('2026-10-07T14:05:00+07:00')());
    expect(box.sent).toHaveLength(0);
    expect(tables.notifications.find((row) => row.agent_item_id === 'a2')?.status).toBe('skipped');
  });

  it('a notice sent before midnight +07 does not count against the next day', async () => {
    const tables = world([item('a2', { created_at: '2026-10-06T17:05:00.000Z' })], 1);
    tables.notifications.push({ id: 'n0', household_id: H, user_id: 'u1', agent_item_id: 'a1', channel: 'email', status: 'sent', attempts: 1, created_at: '2026-10-06T16:50:00.000Z' });
    const box = inbox();
    await deliverPending(fakeDb(tables), box.mailer, CONFIG, await clockOn('2026-10-07T00:10:00+07:00')());
    expect(box.sent).toHaveLength(1);
  });
});
