import { describe, expect, it } from 'vitest';
import { escalationJsonSchema } from './lease';

describe('escalationJsonSchema', () => {
  it.each([
    { kind: 'none' },
    { kind: 'percent', value: 500, every_months: 12 },
    { kind: 'fixed', value: 200_000, every_months: 6, rounding_vnd: 1000 },
  ])('reads %j', (escalation) => {
    expect(escalationJsonSchema.safeParse(escalation).success).toBe(true);
  });

  it.each([
    { kind: 'percent', value: 500 },
    { kind: 'fixed', value: 200_000, every_months: 0 },
    { kind: 'percent', value: 0, every_months: 12 },
    { kind: 'fixed', value: 200_000, every_months: 12, rounding_vnd: 0 },
    { kind: 'percent', value: 500, every_months: 12.5 },
  ])('refuses %j, as leases_escalation_check does', (escalation) => {
    expect(escalationJsonSchema.safeParse(escalation).success).toBe(false);
  });
});
