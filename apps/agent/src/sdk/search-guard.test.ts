import { describe, expect, it } from 'vitest';
import { decideToolUse, type ToolPolicy } from './path-policy';
import { searchDenial, type SearchTerm } from './search-guard';

const FAMILY = ['Hoàng Văn Em Demo', 'Dãy trọ Dĩ An', 'Đường Lê Lợi'];
const policy: ToolPolicy = { allowed: new Set(['WebSearch', 'WebFetch']), jobDir: '/tmp', searchTerms: FAMILY, fetchable: new Set() };
const search = (query: string) => decideToolUse(policy, 'WebSearch', { query });

describe('the WebSearch hook keeps family data out of search words', () => {
  it.each([
    ['a tenant name', 'hoàng văn em demo vay ngân hàng'],
    ['a property nickname', 'giá thuê dãy trọ dĩ an'],
    ['a property street', 'giá nhà đường lê lợi'],
    ['a phone number', 'số 0901 234 567 là của ai'],
    ['an amount', 'vay 500 triệu lãi bao nhiêu'],
  ])('denies %s', (_, query) => {
    expect(search(query)).toMatchObject({ allow: false });
  });

  it('lets a four-digit year and a province name through', () => {
    expect(search('lãi suất vay mua nhà 2026 Đồng Nai')).toEqual({ allow: true });
    expect(searchDenial('giá thuê trọ Dĩ An', FAMILY)).toBeNull();
  });

  it('denies a fetch of a page no search returned', () => {
    expect(decideToolUse(policy, 'WebFetch', { url: 'https://other.example/x' })).toMatchObject({ allow: false });
  });
});

const denied = (query: string, terms: readonly SearchTerm[] = []) => expect(searchDenial(query, terms)).not.toBeNull();
const passes = (query: string, terms: readonly SearchTerm[] = []) => expect(searchDenial(query, terms)).toBeNull();

describe('a street is denied with or without its type word', () => {
  const street = ['Đường Võ Văn Ngân'];
  it.each(['giá nhà mặt tiền Võ Văn Ngân Thủ Đức', 'giá đất Đ. Võ Văn Ngân', 'gia nha vo van ngan', 'phố Võ Văn Ngân giá thuê', 'Võ Văn Ngân phường Linh Chiểu giá đất'])('denies %s', (query) => denied(query, street));

  it('denies a street written with a short type word, a highway and an alley', () => {
    denied('kẹt xe quốc lộ Xa Lộ Hà Nội', ['Quốc lộ Xa Lộ Hà Nội']);
    denied('giá nhà hẻm Lê Lợi', ['Hẻm Lê Lợi']);
    denied('giá nhà kiệt Lê Lợi', ['Kiệt Lê Lợi']);
  });

  it('lets a district name through', () => passes('giá nhà Thủ Đức hiện nay', street));
});

describe('a person is denied by two of their name words, in any order', () => {
  const tenant: SearchTerm[] = [{ person: 'Hoàng Văn Em Demo' }];
  it.each(['Hoàng Em Demo vay ngân hàng', 'Em Demo Hoàng Văn', 'em, hoang bao nhiêu', 'HOÀNG VĂN thuê nhà', 'Ｈoàng Văn nợ'])('denies %s', (query) => denied(query, tenant));

  it('lets one word of the name through', () => passes('giá thuê văn phòng quận Bình Thạnh', tenant));
});

describe('a nickname that is only a property type and a place name is not a term', () => {
  it('lets a market question about the place pass', () => {
    passes('giá đất Bảo Lộc 2026', []);
    passes('giá căn hộ Thủ Đức hiện nay', []);
  });
});

describe('an amount does not leave through a year, words or full-width digits', () => {
  it.each([
    'vay 2000 triệu trả góp lãi bao nhiêu',
    'giá thuê 1950 nghìn một tháng',
    'vay năm trăm triệu lãi suất bao nhiêu',
    'nhà giá hai tỷ rưỡi Thủ Đức',
    'vay ５００ triệu lãi',
    'vay 2026 tr lãi',
    'giá 2025 đồng một mét',
    'thuê 2026k một tháng',
    'lãi 2026%',
    'giá 500 ₫',
    'vay bao nhiêu triệu',
  ])('denies %s', (query) => denied(query));

  it.each(['lãi suất vay mua nhà năm 2026', 'tỷ giá và tỷ lệ vay 2026', 'hợp đồng thuê nhà mẫu 2026', 'giá đất Đồng Nai 2026', 'thuế nhà đất năm 2026 thay đổi gì'])('lets %s through', (query) => passes(query));
});
