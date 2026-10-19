import { describe, expect, it } from 'vitest';
import { rankCandidates, type FindRow } from './read';

function row(overrides: Partial<FindRow> & Pick<FindRow, 'id' | 'nickname'>): FindRow {
  const address = { address_line: null, commune_name: null, province_name: null, certificate_address_text: null, code: null, ...overrides };
  const searchText = [address.nickname, address.code, address.address_line, address.commune_name, address.province_name, address.certificate_address_text]
    .filter((part) => part !== null)
    .join(' ');
  return { search_text: searchText, ...address };
}

const baoLoc = row({ id: 'p1', nickname: 'Demo Đất Bảo Lộc', code: 'BL-01', province_name: 'Lâm Đồng' });
const quan7 = row({
  id: 'p2',
  nickname: 'Demo Nhà phố',
  code: 'NP-02',
  address_line: '12 Đường số 5',
  commune_name: 'Phường Tân Hưng',
  province_name: 'Thành phố Hồ Chí Minh',
  search_text: 'Demo Nhà phố NP-02 12 Đường số 5 Phường Tân Hưng Thành phố Hồ Chí Minh Phường Tân Kiểng Quận 7',
});
const cert = row({ id: 'p3', nickname: 'Demo Căn hộ', code: 'CH-03', certificate_address_text: 'Lô B, Khu dân cư Bảo Lộc' });

describe('rankCandidates', () => {
  it('finds a property by its pre-2025 district name and says that is what matched', () => {
    expect(rankCandidates([baoLoc, quan7, cert], 'quan 7')).toEqual([
      { id: 'p2', nickname: 'Demo Nhà phố', code: 'NP-02', address: '12 Đường số 5, Phường Tân Hưng, TP. Hồ Chí Minh', reasons: ['old ward, district or province name'] },
    ]);
  });

  it('puts an exact code first even when other properties match the same words', () => {
    const codeLike = row({ id: 'p4', nickname: 'Demo CH-03 kho', code: 'K-04' });
    expect(rankCandidates([codeLike, cert], 'ch-03').map((found) => [found.id, found.reasons])).toEqual([
      ['p3', ['code']],
      ['p4', ['nickname']],
    ]);
  });

  it('ranks a nickname match above an address-only match and names every field that matched', () => {
    expect(rankCandidates([cert, baoLoc], 'Bao Loc').map((found) => [found.id, found.reasons])).toEqual([
      ['p1', ['nickname']],
      ['p3', ['certificate address']],
    ]);
  });

  it('names each field a word came from when the words span several', () => {
    expect(rankCandidates([quan7], 'nha pho quan 7').map((found) => found.reasons)).toEqual([['nickname', 'old ward, district or province name']]);
  });

  it('needs every word to match', () => {
    expect(rankCandidates([baoLoc, quan7, cert], 'bao loc quan 7')).toEqual([]);
  });

  it('returns at most ten candidates', () => {
    const many = Array.from({ length: 12 }, (_, index) => row({ id: `p${index}`, nickname: `Demo Kho ${index}` }));
    expect(rankCandidates(many, 'kho')).toHaveLength(10);
  });
});
