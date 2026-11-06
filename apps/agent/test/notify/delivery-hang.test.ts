import { createServer, type Server } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { smtpMailer, type DeliveryConfig } from '../../src/notify/smtp';
import { startDelivery } from '../../src/notify/start';
import { memoryDb } from '@esta/ops/test/memory-db';
import { clockOn } from '../full-seed';

type Row = Record<string, unknown>;
const H = 'h1';
const item = (id: string): Row => ({ id, household_id: H, kind: 'alert', severity: 'action', audience: 'all', title: `Ghi chú ${id}`, dedupe_key: `k:${id}`, status: 'new', created_at: '2026-10-07T00:00:10.000Z' });

describe('a mail host that accepts and never greets', () => {
  let server: Server;
  let port = 0;
  beforeAll(async () => {
    server = createServer(() => undefined);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as { port: number }).port;
  });
  afterAll(() => {
    server.close();
  });
  const config = (): DeliveryConfig => ({ smtpUrl: `smtp://127.0.0.1:${port}`, appUrl: 'http://127.0.0.1:3700', from: 'Esta <esta@esta.localhost>' });
  const tables = () => ({
    agent_items: [item('a1'), item('a2')],
    household_members: [{ id: 'm1', household_id: H, user_id: 'u1', invited_email: 'me.lane2@demo.esta.test', is_operator: false, locale: 'vi' }],
    notification_preferences: [{ member_id: 'm1', household_id: H, channel: 'email', kinds: ['brief', 'action'], daily_cap: 10 }],
    notifications: [] as Row[],
  });

  it('fails a send within the transport timeouts, not nodemailer defaults', async () => {
    const started = Date.now();
    await expect(smtpMailer(config().smtpUrl, 300).send({ from: 'a@b.test', to: 'c@d.test', subject: 's', html: 'h', text: 't' })).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(3_000);
  });

  it('a nudge returns at once and the caller is free to start the next job while the run waits on the host', async () => {
    const rows = tables();
    const delivery = startDelivery(memoryDb(rows), config(), clockOn('2026-10-07T07:05:00+07:00'), () => undefined, smtpMailer(config().smtpUrl, 1_500));
    const started = Date.now();
    delivery.nudge();
    delivery.nudge();
    const job = Promise.resolve('next job started');
    await expect(job).resolves.toBe('next job started');
    expect(Date.now() - started).toBeLessThan(1_000);
    await delivery.settled();
    delivery.stop();
    // Both notices were tried (the second nudge ran once more after the first run ended) and none is stuck.
    expect(rows.notifications.map((row) => row.status)).toEqual(['failed', 'failed']);
  }, 30_000);
});
