import { describe, expect, it } from 'vitest';
import {
  currentAddressText,
  applyPropertyFilters,
  parsePropertyFilters,
  preferPhrase,
  propertyFiltersQuery,
  searchTokens,
  shortProvinceName,
  type PropertyListRow,
} from './filters';

function row(nickname: string, fields: Partial<PropertyListRow> = {}): PropertyListRow {
  return {
    id: nickname,
    nickname,
    code: 'X',
    kind: 'townhouse',
    useMode: 'rental',
    legalStatus: 'certified',
    coverPhotoPath: null,
    addressLine: null,
    communeName: null,
    provinceCode: '79',
    provinceName: 'Thành phố Hồ Chí Minh',
    certificateAddressText: null,
    legacyProvinceNames: ['Thành phố Hồ Chí Minh'],
    searchText: nickname,
    location: null,
    hasBoundary: false,
    ownerPartyIds: [],
    ...fields,
  };
}

const ME = '6f9619ff-8b86-4011-b42d-00c04fc964ff';
const RYAN = '7f9619ff-8b86-4011-b42d-00c04fc964ff';

const q7 = row('Nhà phố Q7', { ownerPartyIds: [ME] });
const thuDuc = row('Căn hộ Thủ Đức', { kind: 'apartment', ownerPartyIds: [ME, RYAN] });
const diAn = row('Dãy trọ Dĩ An', { kind: 'rooming_house', legacyProvinceNames: ['Tỉnh Bình Dương'], ownerPartyIds: [ME] });
const q1 = row('Mặt bằng Quận 1', { kind: 'commercial_space', ownerPartyIds: [ME] });
const bienHoa = row('Kho Biên Hòa', {
  ownerPartyIds: [ME, RYAN],
  kind: 'warehouse',
  provinceCode: '75',
  provinceName: 'Thành phố Đồng Nai',
  legacyProvinceNames: ['Tỉnh Đồng Nai'],
});
const longAn = row('Đất vườn Long An', {
  ownerPartyIds: [RYAN],
  kind: 'agricultural_land',
  useMode: 'held',
  provinceCode: '80',
  provinceName: 'Tỉnh Tây Ninh',
  legacyProvinceNames: ['Tỉnh Long An'],
});
const baoLoc = row('Đất Bảo Lộc', {
  ownerPartyIds: [ME],
  kind: 'residential_land',
  useMode: 'held',
  legalStatus: 'paper_only',
  provinceCode: '68',
  provinceName: 'Tỉnh Lâm Đồng',
  legacyProvinceNames: ['Tỉnh Lâm Đồng'],
});
const lane = [q7, thuDuc, diAn, q1, bienHoa, longAn, baoLoc];

const none = { q: '', sort: 'name', view: 'list', province: null, kind: null, use: null, legal: null, owner: null } as const;
const names = (rows: readonly PropertyListRow[]) => rows.map((r) => r.nickname);

describe('parsePropertyFilters', () => {
  it('reads every param', () => {
    expect(
      parsePropertyFilters({ q: '  di   an ', province: '79', kind: 'rooming_house', use: 'rental', legal: 'certified', owner: ME, sort: 'name', view: 'map' }),
    ).toEqual({ q: 'di an', province: '79', kind: 'rooming_house', use: 'rental', legal: 'certified', owner: ME, sort: 'name', view: 'map' });
  });

  it('reads a former province by name', () => {
    expect(parsePropertyFilters({ province: 'Tỉnh Bình Dương' }).province).toBe('Tỉnh Bình Dương');
    expect(parsePropertyFilters({ province: 'Tỉnh Bà Rịa–Vũng Tàu' }).province).toBe('Tỉnh Bà Rịa–Vũng Tàu');
  });

  it('drops unknown values and keeps the rest', () => {
    expect(parsePropertyFilters({ kind: 'castle', use: 'rental', legal: 'maybe', sort: 'price', view: 'globe', province: '7', owner: 'x' })).toEqual({
      ...none,
      use: 'rental',
    });
    expect(parsePropertyFilters({ province: '<script>' }).province).toBeNull();
    expect(parsePropertyFilters({ province: 'x'.repeat(81) }).province).toBeNull();
  });

  it('reads an owner party id and refuses a malformed one', () => {
    expect(parsePropertyFilters({ owner: RYAN }).owner).toBe(RYAN);
    expect(parsePropertyFilters({ owner: RYAN.toUpperCase() }).owner).toBe(RYAN);
    expect(parsePropertyFilters({ owner: 'ryan' }).owner).toBeNull();
    expect(parsePropertyFilters({ owner: `${RYAN}x` }).owner).toBeNull();
    expect(parsePropertyFilters({ owner: "' or 1=1" }).owner).toBeNull();
  });

  it('takes the first of a repeated param and caps the query', () => {
    expect(parsePropertyFilters({ kind: ['warehouse', 'villa'] }).kind).toBe('warehouse');
    expect(parsePropertyFilters({ q: 'a'.repeat(150) }).q).toHaveLength(100);
  });

  it('round-trips through propertyFiltersQuery, leaving out defaults', () => {
    const filters = parsePropertyFilters({ q: 'bao loc', province: 'Tỉnh Bình Dương', kind: 'warehouse' });
    const query = propertyFiltersQuery(filters);
    expect(query).toBe('?q=bao%20loc&province=T%E1%BB%89nh%20B%C3%ACnh%20D%C6%B0%C6%A1ng&kind=warehouse');
    const params = Object.fromEntries(query.slice(1).split('&').map((pair) => pair.split('=').map(decodeURIComponent)));
    expect(parsePropertyFilters(params)).toEqual(filters);
    expect(propertyFiltersQuery(none)).toBe('');
  });

  it('keeps the map view through a filter change', () => {
    const filters = parsePropertyFilters({ view: 'map', kind: 'warehouse', locate: 'any' });
    expect(propertyFiltersQuery({ ...filters, kind: null })).toBe('?view=map');
  });
});

describe('applyPropertyFilters', () => {
  it('keeps the properties an owner holds a share of, a 50/50 one included', () => {
    expect(names(applyPropertyFilters(lane, { ...none, owner: RYAN }).rows)).toEqual(['Căn hộ Thủ Đức', 'Đất vườn Long An', 'Kho Biên Hòa']);
    expect(names(applyPropertyFilters(lane, { ...none, owner: ME }).rows)).toHaveLength(6);
  });

  it('tallies each owner over the rows the other filters keep', () => {
    expect(applyPropertyFilters(lane, none).tallies.owner).toEqual({ all: 7, values: new Map([[ME, 6], [RYAN, 3]]) });
    expect(applyPropertyFilters(lane, { ...none, kind: 'warehouse' }).tallies.owner.values).toEqual(new Map([[ME, 1], [RYAN, 1]]));
  });

  it('keeps only the former province for a legacy name', () => {
    expect(names(applyPropertyFilters(lane, { ...none, province: 'Tỉnh Bình Dương' }).rows)).toEqual(['Dãy trọ Dĩ An']);
  });

  it('keeps every row of a current province, the former Bình Dương included', () => {
    expect(names(applyPropertyFilters(lane, { ...none, province: '79' }).rows)).toEqual([
      'Căn hộ Thủ Đức',
      'Dãy trọ Dĩ An',
      'Mặt bằng Quận 1',
      'Nhà phố Q7',
    ]);
  });

  it('offers a former province only where it differs from the current one', () => {
    const { values } = applyPropertyFilters(lane, none).tallies.province;
    expect(Object.fromEntries(values)).toEqual({ '79': 4, '75': 1, '80': 1, '68': 1, 'Tỉnh Bình Dương': 1, 'Tỉnh Long An': 1 });
  });

  it('tallies each filter over the rows that pass the others', () => {
    const { tallies, rows } = applyPropertyFilters(lane, { ...none, use: 'held', kind: 'residential_land' });
    expect(names(rows)).toEqual(['Đất Bảo Lộc']);
    expect(tallies.kind).toEqual({ all: 2, values: new Map([['agricultural_land', 1], ['residential_land', 1]]) });
    expect(tallies.use.all).toBe(1);
    expect(tallies.legal.values.get('paper_only')).toBe(1);
  });

  it('sorts by nickname with Vietnamese collation, Đ after D and numbers in order', () => {
    const sorted = applyPropertyFilters([...lane, row('Tài sản Demo 10'), row('Tài sản Demo 9')], none).rows;
    expect(names(sorted)).toEqual([
      'Căn hộ Thủ Đức',
      'Dãy trọ Dĩ An',
      'Đất Bảo Lộc',
      'Đất vườn Long An',
      'Kho Biên Hòa',
      'Mặt bằng Quận 1',
      'Nhà phố Q7',
      'Tài sản Demo 9',
      'Tài sản Demo 10',
    ]);
  });

  it('sorts by area: province as people name it, then nickname, with no province last', () => {
    const noAddress = row('Nhà chưa có địa chỉ', { provinceCode: null, provinceName: null, legacyProvinceNames: [] });
    expect(names(applyPropertyFilters([noAddress, ...lane], { ...none, sort: 'area' }).rows)).toEqual([
      'Kho Biên Hòa',
      'Căn hộ Thủ Đức',
      'Dãy trọ Dĩ An',
      'Mặt bằng Quận 1',
      'Nhà phố Q7',
      'Đất Bảo Lộc',
      'Đất vườn Long An',
      'Nhà chưa có địa chỉ',
    ]);
    expect(parsePropertyFilters({ sort: 'area' }).sort).toBe('area');
    expect(propertyFiltersQuery({ ...none, sort: 'area' })).toBe('?sort=area');
  });
});

describe('search', () => {
  it('folds case, marks and đ, and drops commas, like esta_unaccent', () => {
    expect(searchTokens('  Dĩ An,  BÌNH   Dương ')).toEqual(['di', 'an', 'binh', 'duong']);
    expect(searchTokens('ĐƯỜNG')).toEqual(['duong']);
    expect(searchTokens(' , ')).toEqual([]);
  });

  it('prefers rows that hold the whole query as a phrase', () => {
    const rows = [
      { searchText: 'can ho thu duc duong vo van ngan phuong binh tho' },
      { searchText: 'day tro di an phuong di an tinh binh duong' },
    ];
    expect(preferPhrase(rows, ['binh', 'duong'])).toEqual([rows[1]]);
    expect(preferPhrase(rows, ['duong', 'binh'])).toEqual(rows);
    expect(preferPhrase(rows, ['binh'])).toEqual(rows);
  });
});

describe('shortProvinceName', () => {
  it.each([
    ['Thành phố Hồ Chí Minh', 'TP. Hồ Chí Minh'],
    ['Tỉnh Bình Dương', 'Bình Dương'],
    ['Thành phố Đồng Nai', 'TP. Đồng Nai'],
  ])('%s reads %s', (name, short) => {
    expect(shortProvinceName(name)).toBe(short);
  });
});

describe('currentAddressText', () => {
  it('joins the street line, commune and short province, and is null with none of them', () => {
    expect(currentAddressText({ addressLine: '903/9 Demo Đường Nguyễn An Ninh', communeName: 'Phường Dĩ An', provinceName: 'Thành phố Hồ Chí Minh' })).toBe(
      '903/9 Demo Đường Nguyễn An Ninh, Phường Dĩ An, TP. Hồ Chí Minh',
    );
    expect(currentAddressText({ addressLine: '', communeName: null, provinceName: 'Tỉnh Long An' })).toBe('Long An');
    expect(currentAddressText({ addressLine: null, communeName: null, provinceName: null })).toBeNull();
  });
});
