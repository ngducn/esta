import { describe, expect, expectTypeOf, it } from 'vitest';
import type { z } from 'zod';
import { typedValueSchema } from './schema';
import type { TypedValue } from './types';

describe('typedValueSchema', () => {
  it('reads exactly the values the type allows', () => {
    expectTypeOf<z.output<typeof typedValueSchema>>().toEqualTypeOf<TypedValue>();
  });

  it('reads each kind and refuses an unknown kind or a fraction', () => {
    for (const value of [{ kind: 'vnd', value: 4_000_000 }, { kind: 'bp', value: 900 }, { kind: 'count', value: 8, unit: 'phòng' }, { kind: 'months', value: 180 }, { kind: 'date', value: '2026-10-07' }]) {
      expect(typedValueSchema.parse(value)).toEqual(value);
    }
    expect(typedValueSchema.safeParse({ kind: 'percent', value: 9 }).success).toBe(false);
    expect(typedValueSchema.safeParse({ kind: 'vnd', value: 1.5 }).success).toBe(false);
  });
});
