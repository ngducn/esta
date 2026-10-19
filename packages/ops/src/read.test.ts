import { describe, expect, it } from 'vitest';
import type { PropertyRow } from './properties';
import { rankCandidates } from './read';

function row(overrides: Partial<PropertyRow> & Pick<PropertyRow, 'id' | 'nickname' | 'code'>): PropertyRow {
  return {
    kind: 'townhouse',
    useMode: 'rental',
    legalStatus: 'certified',
    coverPhotoPath: null,
    addressLine: null,
    communeName: null,
    provinceCode: null,
    provinceName: null,
    certificateAddressText: null,
    legacyProvinceNames: [],
    searchText: '',
    location: null,
    hasBoundary: false,
    ownerPartyIds: [],
    vacantSince: null,
    unitCount: 1,
    ...overrides,
  };
}

const baoLoc = row({ id: 'p1', nickname: 'Demo Đất Bảo Lộc', code: 'BL-01', provinceName: 'Lâm Đồng' });
const nhaPho = row({ id: 'p2', nickname: 'Demo Nhà phố', code: 'NP-02', addressLine: '12 Đường số 5', communeName: 'Phường Tân Hưng', provinceName: 'Thành phố Hồ Chí Minh' });
const canHo = row({ id: 'p3', nickname: 'Demo Căn hộ', code: 'CH-03', certificateAddressText: 'Lô B, Khu dân cư Bảo Lộc' });

const reasons = (rows: readonly PropertyRow[], text: string) => rankCandidates(rows, text).map((found) => [found.id, found.reasons]);

describe('rankCandidates', () => {
  it('says a word no visible field holds matched an old ward, district or province name', () => {
    expect(rankCandidates([nhaPho], 'quan 7')).toEqual([
      { id: 'p2', nickname: 'Demo Nhà phố', code: 'NP-02', address: '12 Đường số 5, Phường Tân Hưng, TP. Hồ Chí Minh', reasons: ['old ward, district or province name'] },
    ]);
  });

  it('names each field a word came from when the words span several', () => {
    expect(reasons([nhaPho], 'nha pho, quan 7')).toEqual([['p2', ['nickname', 'old ward, district or province name']]]);
  });

  it('puts an exact code first, then a nickname match, then the rest', () => {
    const codeInName = row({ id: 'p4', nickname: 'Demo CH-03 kho', code: 'K-04' });
    expect(reasons([codeInName, canHo], 'ch-03')).toEqual([
      ['p3', ['code']],
      ['p4', ['nickname']],
    ]);
    expect(reasons([canHo, baoLoc], 'Bảo Lộc')).toEqual([
      ['p1', ['nickname']],
      ['p3', ['certificate address']],
    ]);
  });

  it('returns at most ten candidates', () => {
    const many = Array.from({ length: 12 }, (_, index) => row({ id: `p${index}`, nickname: `Demo Kho ${index}`, code: `K-${index}` }));
    expect(rankCandidates(many, 'kho')).toHaveLength(10);
  });
});
