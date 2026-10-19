import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { dbRefusal, invalid } from './kit';

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
