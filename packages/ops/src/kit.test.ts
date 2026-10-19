import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { changedColumns, dbRefusal, invalid } from './kit';

describe('dbRefusal', () => {
  it.each([
    ['23505', { kind: 'conflict' }],
    ['23503', { kind: 'conflict' }],
    ['23P01', { kind: 'conflict' }],
    ['23514', { kind: 'invalid', issues: [] }],
    ['22P02', { kind: 'invalid', issues: [] }],
    ['42501', { kind: 'forbidden' }],
    ['XX000', { kind: 'failed' }],
  ])('maps SQLSTATE %s by its class', (code, refusal) => {
    expect(dbRefusal({ code, message: 'whatever the server said' })).toEqual(refusal);
  });

  it('names an ESTA_* sentinel from the feature table before the SQLSTATE', () => {
    const sentinels = { ESTA_LEASE_OVERLAP: { kind: 'overlap' } } as const;
    expect(dbRefusal({ code: '23514', message: 'ESTA_LEASE_OVERLAP' }, sentinels)).toEqual({ kind: 'overlap' });
    expect(dbRefusal({ code: '23514', message: 'toString' }, sentinels)).toEqual({ kind: 'invalid', issues: [] });
  });
});

describe('invalid', () => {
  it('keeps paths and codes, never zod English', () => {
    const parsed = z.object({ property: z.object({ code: z.string().regex(/^[A-Z]+$/) }) }).safeParse({ property: { code: 'q7' } });
    expect(parsed.success ? null : invalid(parsed.error)).toEqual({ kind: 'invalid', issues: [{ path: 'property.code', code: 'invalid_format' }] });
  });
});

describe('changedColumns', () => {
  type Terms = { rent_vnd: number; escalation: { kind: string }; notice_days: number | null };
  const current: Terms = { rent_vnd: 9_000_000, escalation: { kind: 'none' }, notice_days: 30 };

  it('names only the columns whose values differ, objects compared by value, with each side', () => {
    const next: Terms = { rent_vnd: 9_500_000, escalation: { kind: 'none' }, notice_days: null };
    expect(changedColumns(current, next, ['rent_vnd', 'escalation', 'notice_days'])).toEqual({ before: { rent_vnd: 9_000_000, notice_days: 30 }, set: { rent_vnd: 9_500_000, notice_days: null } });
  });

  it('is null when no column it was given differs', () => {
    expect(changedColumns(current, { ...current, notice_days: 60 }, ['rent_vnd', 'escalation'])).toBeNull();
  });
});
