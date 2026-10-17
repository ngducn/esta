import { describe, expect, it } from 'vitest';
import { newPartiesSchema, newPartySchema, usedNewParties, type NewParty } from './party';

const id = (n: number) => `0c1d2e3f-4a5b-5c6d-8e7f-8091a2b3c4d${n}`;
const person = (n: number, overrides: Record<string, unknown> = {}) => ({ id: id(n), kind: 'individual', full_name: 'Lê Văn Demo', id_last4: '6789', ...overrides });

describe('newPartySchema', () => {
  it('accepts a person with the last 4 digits, or none', () => {
    expect(newPartySchema.parse(person(1)).kind).toBe('individual');
    expect(newPartySchema.parse(person(1, { id_last4: null })).kind).toBe('individual');
  });

  it('refuses a full ID number (SPEC D11)', () => {
    expect(newPartySchema.safeParse(person(1, { id_last4: '079201005582' })).success).toBe(false);
  });

  it('trims the name and refuses a blank one', () => {
    expect(newPartySchema.parse(person(1, { full_name: '  Lê Văn Demo ' })).full_name).toBe('Lê Văn Demo');
    expect(newPartySchema.safeParse(person(1, { full_name: '   ' })).success).toBe(false);
  });

  it('accepts a bank and refuses an id that is not a uuid', () => {
    expect(newPartySchema.safeParse({ id: id(2), kind: 'organization', full_name: 'Ngân hàng Demo', bank: true }).success).toBe(true);
    expect(newPartySchema.safeParse(person(1, { id: 'abc' })).success).toBe(false);
  });
});

describe('newPartiesSchema', () => {
  it('caps how many parties one save can create', () => {
    const many = Array.from({ length: 21 }, (_, n) => person(0, { id: `0c1d2e3f-4a5b-5c6d-8e7f-8091a2b3c4${String(n).padStart(2, '0')}` }));
    expect(newPartiesSchema.safeParse(many).success).toBe(false);
  });
});

describe('usedNewParties', () => {
  const pending = [newPartySchema.parse(person(1)), newPartySchema.parse(person(2, { full_name: 'Phạm Thị Demo' }))] satisfies NewParty[];

  it('keeps only the parties the save refers to', () => {
    expect(usedNewParties(pending, [id(2), '00000000-0000-4000-8000-000000000000']).map((party) => party.id)).toEqual([id(2)]);
  });

  it('keeps none when the user dropped them all', () => {
    expect(usedNewParties(pending, [])).toEqual([]);
  });
});
