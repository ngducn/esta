import { describe, expect, it } from 'vitest';
import { runOp } from './op';
import { taxInputSave } from './tax-ops';
import { fakeDb, HOUSEHOLD, opContext as context, type Sent } from './test/fake-db';

const OWNER = '0b6c1f9e-7d1a-4c55-9a3e-5b0c2d1e0030';
const input = { party_id: OWNER, year: 2026, other_business_revenue_vnd: 200_000_000 };

function household(saved: number | null) {
  return fakeDb((sent: Sent) => {
    if (sent.table === 'parties') return [{ id: OWNER }];
    if (sent.table === 'owner_tax_inputs' && sent.method === 'GET') return saved === null ? [] : [{ other_business_revenue_vnd: saved }];
    return [];
  });
}

describe('taxInputSave', () => {
  it('upserts one row on the owner and year', async () => {
    const { db, sent } = household(null);
    expect(await runOp(taxInputSave, context(db), input)).toEqual({ ok: true, value: { other_business_revenue_vnd: 200_000_000 } });
    const write = sent.at(-1);
    expect(write).toMatchObject({ method: 'POST', table: 'owner_tax_inputs', body: { ...input, household_id: HOUSEHOLD } });
    expect(write?.query.get('on_conflict')).toBe('household_id,party_id,year');
  });

  it('plans a value already saved as unchanged, and 0 with no row as unchanged', async () => {
    const parsed = taxInputSave.input.parse(input);
    expect(await taxInputSave.plan(context(household(200_000_000).db), parsed)).toEqual({ ok: true, value: { kind: 'unchanged', current: { other_business_revenue_vnd: 200_000_000 } } });
    const zero = taxInputSave.input.parse({ ...input, other_business_revenue_vnd: 0 });
    expect(await taxInputSave.plan(context(household(null).db), zero)).toMatchObject({ ok: true, value: { kind: 'unchanged' } });
  });

  it('refuses a negative amount, a fraction and a year out of range before any read', () => {
    for (const bad of [{ other_business_revenue_vnd: -1 }, { other_business_revenue_vnd: 1.5 }, { year: 1999 }]) {
      expect(taxInputSave.input.safeParse({ ...input, ...bad }).success).toBe(false);
    }
  });

  it('refuses an owner outside the household, and a viewer as RLS does', async () => {
    const parsed = taxInputSave.input.parse(input);
    expect(await taxInputSave.plan(context(fakeDb().db), parsed)).toEqual({ ok: false, reason: { kind: 'not_found' } });
    const { db } = fakeDb(
      (sent) => (sent.table === 'parties' ? [{ id: OWNER }] : []),
      (sent) => (sent.method === 'POST' ? { code: '42501', message: 'new row violates row-level security policy' } : null),
    );
    expect(await runOp(taxInputSave, context(db), input)).toEqual({ ok: false, reason: { kind: 'forbidden' } });
  });
});
