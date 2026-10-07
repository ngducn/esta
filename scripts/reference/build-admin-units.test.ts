import { describe, expect, test } from 'vitest';
import { buildAdminUnits, mergeKindOf, type CuratedLink, type LegacyLink, type RawSources } from './build-admin-units.ts';
import type { SheetRow } from './sources.ts';

const TITLE: SheetRow = ['Đơn vị hành chính từ ngày 01/7/2025', null, null, 'Đơn vị hành chính trước ngày 01/7/2025'];
const HEADER: SheetRow[] = [
  TITLE,
  ['Tỉnh, thành phố', 'Tên Xã mới', 'Mã Xã mới', 'Tên Xã cũ', 'Mã Xã cũ', 'Ghi chú', 'Quận/huyện', 'Tỉnh cũ'],
];
const HCM = { MaTinh: '79', TenTinh: 'Thành phố Hồ Chí Minh', LoaiHinh: 'Thành phố Trung ương' };
const TAY_NINH = { MaTinh: '80', TenTinh: ' Tỉnh  Tây Ninh ', LoaiHinh: 'Tỉnh' };

function row(newCode: string | number, oldName: string | null, oldCode: string | number | null, note: string, district: string, province: string): SheetRow {
  return ['Tỉnh Tây Ninh (80)', 'Phường Mới', newCode === null ? null : String(newCode), oldName, oldCode === null ? null : String(oldCode), note, district, province];
}

function sources(overrides: Partial<RawSources> = {}): RawSources {
  return {
    provinces: [HCM, TAY_NINH],
    communes: [
      { MaTinh: '79', MaPhuongXa: '25942', TenPhuongXa: 'Phường \nDĩ An', LoaiHinh: 'Phường' },
      { MaTinh: '80', MaPhuongXa: '27694', TenPhuongXa: 'Phường Long An', LoaiHinh: 'Phường' },
      { MaTinh: '80', MaPhuongXa: '02302', TenPhuongXa: 'Xã Minh Quang', LoaiHinh: 'Xã' },
    ],
    conversion: [
      ...HEADER,
      ['TÂY NINH', null, null, null, null, null, null, null],
      row(27694, ' Phường 1 ', '27694', 'Nhập toàn bộ', 'Thành phố Tân An (794)', 'Tỉnh Long An (80)'),
      row(27694, 'Phường 3', '27697', 'Nhập toàn bộ', 'Thành phố Tân An (794)', 'Tỉnh Long An (80)'),
      row(27694, ' Phường 4 ', '27691', 'Nhập toàn bộ', 'Thành phố Tân An (794)', 'Tỉnh Tiền Giang (82)'),
      row(2302, 'Xã Hồng Quang', '02293', 'Nhập một phần diện tích', 'Huyện Lâm Bình (071)', 'Long An (80)'),
      row('25942', 'Phường Dĩ An', '25942', 'Nhập toàn bộ', 'Thành phố Dĩ An (724)', 'Tỉnh Bình Dương (74)'),
    ],
    curated: [],
    ...overrides,
  };
}

function link(overrides: Partial<LegacyLink>): LegacyLink {
  return {
    oldProvinceCode: '80',
    oldProvinceName: 'Tỉnh Long An',
    oldDistrictCode: '794',
    oldDistrictName: 'Thành phố Tân An',
    oldCommuneCode: '27688',
    oldCommuneName: 'Phường 2',
    newCommuneCode: '27694',
    mergeKind: 'whole',
    source: 'curated: test',
    ...overrides,
  };
}

function legacyFor(result: ReturnType<typeof buildAdminUnits>, oldCommuneCode: string): LegacyLink | undefined {
  return result.legacy.find((candidate) => candidate.oldCommuneCode === oldCommuneCode);
}

describe('buildAdminUnits', () => {
  test('takes each province-level kind from the catalog, not a fixed list', () => {
    const { units } = buildAdminUnits(sources());
    expect(units.slice(0, 2).map((unit) => [unit.code, unit.kind])).toEqual([
      ['79', 'city'],
      ['80', 'province'],
    ]);

    const upgraded = buildAdminUnits(
      sources({ provinces: [HCM, { MaTinh: '80', TenTinh: 'Thành phố Tây Ninh', LoaiHinh: 'Thành phố Trung ương' }] }),
    );
    expect(upgraded.units.find((unit) => unit.code === '80')?.kind).toBe('city');
  });

  test('rejects a catalog unit type it does not know', () => {
    const provinces = [{ MaTinh: '79', TenTinh: 'Thành phố Hồ Chí Minh', LoaiHinh: 'Huyện' }, TAY_NINH];
    expect(() => buildAdminUnits(sources({ provinces }))).toThrow('unknown catalog unit type Huyện');
  });

  test('collapses whitespace in catalog and table names', () => {
    const result = buildAdminUnits(sources());
    expect(result.units.find((unit) => unit.code === '25942')?.name).toBe('Phường Dĩ An');
    expect(result.units.find((unit) => unit.code === '80')?.name).toBe('Tỉnh Tây Ninh');
    expect(legacyFor(result, '27694')?.oldCommuneName).toBe('Phường 1');
  });

  test('derives the old province from the old district when a row names the wrong one', () => {
    const phuong4 = legacyFor(buildAdminUnits(sources()), '27691');
    expect([phuong4?.oldProvinceCode, phuong4?.oldProvinceName]).toEqual(['80', 'Tỉnh Long An']);
  });

  test('names the old province by the spelling most rows use', () => {
    expect(legacyFor(buildAdminUnits(sources()), '02293')?.oldProvinceName).toBe('Tỉnh Long An');
  });

  test('joins on the 5-digit commune code, padding numeric cells', () => {
    const result = buildAdminUnits(sources());
    expect(legacyFor(result, '02293')?.newCommuneCode).toBe('02302');
    expect(result.legacy).toHaveLength(5);
  });

  test('rejects a link to a unit missing from the catalog, and a unit with no link', () => {
    const conversion = [...sources().conversion, row(99999, 'Xã Lạ', '11111', 'Nhập toàn bộ', 'Huyện Lạ (999)', 'Tỉnh Lạ (99)')];
    expect(() => buildAdminUnits(sources({ conversion }))).toThrow('missing from the catalog: 99999');

    const communes = [...sources().communes, { MaTinh: '79', MaPhuongXa: '26506', TenPhuongXa: 'Phường Vũng Tàu', LoaiHinh: 'Phường' }];
    expect(() => buildAdminUnits(sources({ communes }))).toThrow('current units with no legacy link: 26506');
  });

  test('rejects a conversion table whose header changed', () => {
    const conversion = [TITLE, ['Tỉnh', 'Tên mới', 'Mã mới'], ...sources().conversion.slice(2)];
    expect(() => buildAdminUnits(sources({ conversion }))).toThrow('header changed');
  });

  test('appends a curated link the table lacks', () => {
    const added = link({});
    const result = buildAdminUnits(sources({ curated: [{ fix: 'add', link: added }] }));
    expect(legacyFor(result, '27688')).toEqual(added);
    expect(() => buildAdminUnits(sources({ curated: [{ fix: 'add', link: link({ oldCommuneCode: '27697', oldCommuneName: 'Phường 3' }) }] }))).toThrow(
      'duplicates a table row',
    );
  });

  test('recodes the one table row printed with a wrong code', () => {
    const recode = (overrides: Partial<LegacyLink>, tableOldCommuneCode = '02293'): CuratedLink => ({
      fix: 'recode',
      tableOldCommuneCode,
      link: link({
        oldDistrictCode: '071',
        oldDistrictName: 'Huyện Lâm Bình',
        oldCommuneCode: '02290',
        oldCommuneName: 'Xã Hồng Quang',
        newCommuneCode: '02302',
        mergeKind: 'partial',
        ...overrides,
      }),
    });
    const result = buildAdminUnits(sources({ curated: [recode({})] }));
    expect(legacyFor(result, '02293')).toBeUndefined();
    expect(legacyFor(result, '02290')?.source).toBe('curated: test');

    expect(() => buildAdminUnits(sources({ curated: [recode({}, '00000')] }))).toThrow('matches 0 table rows');
    expect(() => buildAdminUnits(sources({ curated: [recode({ mergeKind: 'whole' })] }))).toThrow('changes more than the code');
  });
});

describe('mergeKindOf', () => {
  test.each([
    ['Nhập toàn bộ', 'whole'],
    ['Giữ nguyên', 'whole'],
    ['Đổi tên', 'whole'],
    ['Sắp xếp toàn bộ huyện Lý Sơn thành đặc khu Lý Sơn', 'whole'],
    ['Nhập một phần', 'partial'],
    ['Nhâp một  phần diện tích', 'partial'],
    ['Nhập một phần diện tích,\n toàn bộ dân số', 'partial'],
    ['Phần còn lại sau khi tách một phần vào xã Canh Vinh', 'partial'],
    ['Đổi tên từ một phần Phường 15', 'partial'],
  ] as const)('%j is %s', (note, kind) => {
    expect(mergeKindOf(note)).toBe(kind);
  });
});
