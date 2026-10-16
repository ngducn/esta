import { describe, expect, it } from 'vitest';
import { fakeDb } from '../test/fake-db';
import { householdInfo } from './household-info';

const A = 'aaaaaaaa-0000-5000-8000-000000000000';
const B = 'bbbbbbbb-0000-5000-8000-000000000000';

const db = fakeDb({
  households: [
    { id: A, name: 'Gia đình Demo 1', locale: 'vi' },
    { id: B, name: 'Gia đình Demo 2', locale: 'en' },
  ],
  household_members: [
    { id: 'm1', household_id: A },
    { id: 'm2', household_id: A },
    { id: 'm3', household_id: B },
    { id: 'm4', household_id: B },
    { id: 'm5', household_id: B },
  ],
  properties: [
    { id: 'p1', household_id: A, deleted_at: null },
    { id: 'p2', household_id: A, deleted_at: '2026-10-01T00:00:00Z' },
    { id: 'p3', household_id: B, deleted_at: null },
    { id: 'p4', household_id: B, deleted_at: null },
    { id: 'p5', household_id: B, deleted_at: null },
  ],
});

describe('household_info', () => {
  it('returns only the bound household, with no member or property of another', async () => {
    expect(await householdInfo(db, A)).toEqual({ name: 'Gia đình Demo 1', member_count: 2, property_count: 1, locale: 'vi' });
  });

  it('returns the other household only when bound to it', async () => {
    expect(await householdInfo(db, B)).toEqual({ name: 'Gia đình Demo 2', member_count: 3, property_count: 3, locale: 'en' });
  });

  it('fails for a household that does not exist', async () => {
    await expect(householdInfo(db, 'cccccccc-0000-5000-8000-000000000000')).rejects.toThrow('household_info failed');
  });
});
