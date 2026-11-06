import { describe, expect, it } from 'vitest';
import { fakeDb } from '../../src/test/fake-db';
import { searchDenial } from '../../src/sdk/search-guard';
import { familySearchTerms, householdLabels } from '../../src/tools/household-labels';
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

describe('the terms of the seeded household', () => {
  it('let the market questions of thread case T8 search the web', async () => {
    const terms = await familySearchTerms(fakeDb(withSeedNames(askTables(''))), HOUSEHOLD);
    for (const query of ['giá đất Bảo Lộc 2026', 'giá căn hộ Thủ Đức hiện nay', 'giá nhà phố hiện nay']) expect(searchDenial(query, terms)).toBeNull();
    expect(searchDenial('Hoàng Văn Em Demo Dĩ An', terms)).not.toBeNull();
  });
});

describe('the terms no web search may hold', () => {
  const HH = '00000000-0000-4000-8000-00000000a0c0';
  const db = () =>
    fakeDb({
      households: [{ id: HH, name: 'Gia đình Demo Hoàng' }],
      household_members: [{ household_id: HH, display_name: 'Ryan Demo Nguyễn' }],
      properties: [
        { id: 'p1', household_id: HH, code: 'A', nickname: 'Căn hộ Thủ Đức', kind: 'apartment', use_mode: 'rental', legal_status: 'certified', current_address: { street: 'Đường Võ Văn Ngân', commune_code: '26824', province_code: '79' }, deleted_at: null },
        { id: 'p2', household_id: HH, code: 'B', nickname: 'Đất Bảo Lộc', kind: 'land', use_mode: 'held', legal_status: 'certified', current_address: { commune_code: '24823', province_code: '68' }, deleted_at: null },
        { id: 'p3', household_id: HH, code: 'C', nickname: 'Nhà', kind: 'townhouse', use_mode: 'rental', legal_status: 'certified', current_address: null, deleted_at: null },
        { id: 'p4', household_id: HH, code: 'D', nickname: 'Dãy trọ Dĩ An', kind: 'rooming_house', use_mode: 'rental', legal_status: 'certified', current_address: null, deleted_at: null },
      ],
      admin_units: [
        { code: '26824', name: 'Phường Bình Thọ' },
        { code: '24823', name: 'Phường 1 Bảo Lộc' },
        { code: '79', name: 'Thành phố Hồ Chí Minh' },
        { code: '68', name: 'Tỉnh Lâm Đồng' },
        { code: 'tduc', name: 'Thành phố Thủ Đức' },
      ],
      parties: [
        { id: 'q1', household_id: HH, kind: 'individual', full_name: 'Hoàng Văn Em Demo', short_name: 'Em Hoàng' },
        { id: 'q2', household_id: HH, kind: 'organization', full_name: 'Ngân hàng Demo Vietcombank', short_name: null },
      ],
      utility_accounts: [{ household_id: HH, holder_name: 'Trần Thị Hạnh Demo' }],
    });
  const denial = async (query: string) => searchDenial(query, await familySearchTerms(db(), HH));

  it.each([
    'giá nhà mặt tiền Võ Văn Ngân Thủ Đức',
    'Hoàng Em Demo vay ngân hàng',
    'Em Hoàng thuê nhà',
    'Hạnh Trần đóng điện',
    'Ryan Nguyễn Demo',
    'Gia đình Demo Hoàng',
    'giá thuê dãy trọ Dĩ An',
  ])('denies %s', async (query) => expect(await denial(query)).not.toBeNull());

  it.each(['giá đất Bảo Lộc 2026', 'giá căn hộ Thủ Đức hiện nay', 'lãi suất Ngân hàng Vietcombank vay mua nhà', 'lãi suất vay mua nhà hiện nay'])('lets %s through', async (query) => expect(await denial(query)).toBeNull());
});
