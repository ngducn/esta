import { describe, expect, it } from 'vitest';
import { parseProposal, PROPOSAL_TYPES } from './registry';

const PROPERTY = '00000000-0000-4000-8000-0000000000a1';

describe('parseProposal', () => {
  it('reads a create_task proposal and fills the optional fields with null', () => {
    expect(parseProposal({ type: 'create_task', params: { title: ' Gọi người thuê ', due_on: '2026-10-07', property_id: PROPERTY } })).toEqual({
      ok: true,
      value: { type: 'create_task', params: { title: 'Gọi người thuê', due_on: '2026-10-07', property_id: PROPERTY, lease_id: null } },
    });
  });

  it.each([
    ['a blank title', { title: '  ' }, 'params.title'],
    ['a title over the limit', { title: 'x'.repeat(201) }, 'params.title'],
    ['an impossible date', { title: 'Gọi', due_on: '2026-02-30' }, 'params.due_on'],
    ['a property that is not an id', { title: 'Gọi', property_id: 'Dĩ An' }, 'params.property_id'],
    ['a field the type does not have', { title: 'Gọi', amount: 5 }, 'params'],
  ])('refuses %s', (_, params, path) => {
    const parsed = parseProposal({ type: 'create_task', params });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason.some((line) => line.startsWith(`${path}:`))).toBe(true);
  });

  it('refuses an unknown type and names the types it takes', () => {
    expect(parseProposal({ type: 'sell_property', params: {} })).toEqual({
      ok: false,
      reason: [`type: "sell_property" is not a proposal type; use one of ${Object.keys(PROPOSAL_TYPES).join(', ')}`],
    });
  });

  it('refuses a value that is not a proposal at all', () => {
    expect(parseProposal(null).ok).toBe(false);
    expect(parseProposal({ params: {} }).ok).toBe(false);
  });

  it('names each text param a type writes, and every one is a param of that type', () => {
    for (const [type, spec] of Object.entries(PROPOSAL_TYPES)) {
      const keys = Object.keys(spec.params.shape);
      for (const text of spec.texts) expect(keys, type).toContain(text);
    }
  });
});
