import { describe, expect, it } from 'vitest';
import { runOp } from './op';
import { firstRunSetDismissed } from './onboarding-ops';
import { fakeDb, opContext as context } from './test/fake-db';

const NOW = '2026-10-07T02:00:00.000Z';
const stored = (onboarding: object) => () => [{ onboarding }];

describe('firstRunSetDismissed', () => {
  it('takes only a boolean', () => {
    expect(firstRunSetDismissed.input.parse({ dismissed: true })).toEqual({ dismissed: true });
    expect(firstRunSetDismissed.input.safeParse({ dismissed: 'yes' }).success).toBe(false);
    expect(firstRunSetDismissed.input.safeParse({ dismissed: true, extra: 1 }).success).toBe(false);
    expect(firstRunSetDismissed.input.safeParse({}).success).toBe(false);
  });

  it('hides a visible guide with the clock time and shows it again with an empty object', async () => {
    const hide = fakeDb(stored({}));
    expect(await firstRunSetDismissed.plan(context(hide.db), { dismissed: true })).toEqual({ ok: true, value: { kind: 'change', change: { onboarding: { dismissed_at: NOW } } } });
    const show = fakeDb(stored({ dismissed_at: NOW }));
    expect(await firstRunSetDismissed.plan(context(show.db), { dismissed: false })).toEqual({ ok: true, value: { kind: 'change', change: { onboarding: {} } } });
  });

  it('plans hiding an already hidden guide, and showing a visible one, as unchanged', async () => {
    expect(await firstRunSetDismissed.plan(context(fakeDb(stored({ dismissed_at: '2026-10-01T00:00:00.000Z' })).db), { dismissed: true })).toMatchObject({ ok: true, value: { kind: 'unchanged' } });
    expect(await firstRunSetDismissed.plan(context(fakeDb(stored({})).db), { dismissed: false })).toMatchObject({ ok: true, value: { kind: 'unchanged' } });
  });

  it('refuses a household with no settings row', async () => {
    expect(await runOp(firstRunSetDismissed, context(fakeDb().db), { dismissed: true })).toEqual({ ok: false, reason: { kind: 'not_found' } });
  });

  it('writes the planned object and reads a write RLS matched no row for as forbidden', async () => {
    const written = fakeDb(stored({}));
    expect(await runOp(firstRunSetDismissed, context(written.db), { dismissed: true })).toEqual({ ok: true, value: { dismissed: true } });
    const patch = written.sent.find((sent) => sent.method === 'PATCH');
    expect(patch?.body).toEqual({ onboarding: { dismissed_at: NOW } });
    const refused = fakeDb((sent) => (sent.method === 'GET' ? [{ onboarding: {} }] : []));
    expect(await runOp(firstRunSetDismissed, context(refused.db), { dismissed: true })).toEqual({ ok: false, reason: { kind: 'forbidden' } });
  });

  it('refuses other input', async () => {
    expect(await runOp(firstRunSetDismissed, context(fakeDb(stored({})).db), { dismissed: 1 })).toMatchObject({ ok: false, reason: { kind: 'invalid' } });
  });
});
