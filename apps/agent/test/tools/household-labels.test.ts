import { describe, expect, it } from 'vitest';
import { fakeDb } from '../../src/test/fake-db';
import { householdLabels } from '../../src/tools/household-labels';
import { askTables, withSeedNames } from '../ask-seed';
import { HOUSEHOLD } from '../full-seed';
import { SEED_LABELS } from '../reply-language-cases';

const OTHER = '00000000-0000-4000-8000-00000000a0b0';

describe('the household labels (#348)', () => {
  it('reads the property nicknames, unit labels, party names and place names of the seeded household', async () => {
    const labels = await householdLabels(fakeDb(withSeedNames(askTables(''))), HOUSEHOLD);
    expect(labels).toEqual(expect.arrayContaining([...SEED_LABELS]));
  });

  it('holds a place by its full name and as people say it, a ward by its name without its number', async () => {
    const db = fakeDb({
      properties: [{ id: 'p1', household_id: OTHER, code: 'A', nickname: 'Nhà A', kind: 'townhouse', use_mode: 'rental', legal_status: 'certified', current_address: { commune_code: '24823', province_code: '75' }, deleted_at: null }],
      admin_units: [
        { code: '24823', name: 'Phường 1 Bảo Lộc' },
        { code: '75', name: 'Thành phố Đồng Nai' },
      ],
      units: [{ id: 'u1', household_id: OTHER, label: 'Toàn bộ', kind: 'whole' }],
      parties: [{ id: 'q1', household_id: OTHER, full_name: 'Lê Văn Demo' }],
    });
    expect((await householdLabels(db, OTHER)).toSorted()).toEqual(['Bảo Lộc', 'Đồng Nai', 'Lê Văn Demo', 'Nhà A', 'Phường 1 Bảo Lộc', 'Thành phố Đồng Nai', 'Toàn bộ'].toSorted());
  });

  it('holds no name of another household', async () => {
    const labels = await householdLabels(fakeDb({ ...withSeedNames(askTables('')) }), OTHER);
    expect(labels).toEqual([]);
  });
});
