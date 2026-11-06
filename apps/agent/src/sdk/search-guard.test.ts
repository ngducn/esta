import { describe, expect, it } from 'vitest';
import { decideToolUse, type ToolPolicy } from './path-policy';
import { searchDenial } from './search-guard';

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
