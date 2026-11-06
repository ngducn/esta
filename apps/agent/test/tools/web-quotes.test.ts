import { describe, expect, it } from 'vitest';
import { ToolRejection } from '../../src/tools/server';
import { fetchedPage, requireQuotes } from '../../src/tools/web-quotes';

const PAGE = 'Lãi suất cho vay mua nhà từ 7,5% một năm. Mức phí là 150 nghìn đồng cho mỗi hồ sơ.';

describe('web quotes (AGENT.md §6.4)', () => {
  it('finds a quote word for word', () => {
    expect(requireQuotes(['cho vay mua nhà từ 7,5% một năm'], PAGE)).toEqual([['quote_1_label', 'cho vay mua nhà từ 7,5% một năm']]);
  });

  it('refuses a number inside a larger number', () => {
    expect(() => requireQuotes(['phí là 50 nghìn đồng'], PAGE)).toThrow(ToolRejection);
  });

  it('refuses a quote of fewer than three words', () => {
    expect(() => requireQuotes(['7,5% một'], PAGE)).toThrow(/at least 3 words/);
  });

  it('drops a page that redirected to another host', () => {
    expect(fetchedPage({ name: 'WebFetch', input: { url: 'https://a.example/x' }, result: { code: 302, result: 'REDIRECT to https://b.example/x' } })).toBeNull();
    expect(fetchedPage({ name: 'WebFetch', input: { url: 'https://a.example/x' }, result: { code: 200, result: PAGE } })?.link).toBe('https://a.example/x');
  });
});
