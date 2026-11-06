import { describe, expect, it } from 'vitest';
import { runSheet } from '../../src/tools/fact-sheet';
import { quotePageTool } from '../../src/tools/quote-page';
import { ToolRejection } from '../../src/tools/server';
import { fetchedPage, type FetchedPage } from '../../src/tools/web-quotes';

const URL_A = 'https://demo-news.example/lai-suat';
const TEXT = 'Publication date: 05/10/2026\nLãi suất cho vay mua nhà từ 7,5% một năm. Kỳ hạn vay tối đa là hai mươi lăm năm.';

function turn(read: boolean) {
  const fetched = new Map<string, FetchedPage>();
  const page = fetchedPage({ name: 'WebFetch', input: { url: URL_A }, result: { code: 200, result: TEXT } });
  if (read && page !== null) for (const url of page.urls) fetched.set(url, page);
  const { sheet, cite } = runSheet(1);
  return { sheet, run: quotePageTool({ fetched, cite, locale: 'vi' }) };
}

describe('quote_page', () => {
  it('mints a source record with a new handle', async () => {
    const { sheet, run } = turn(true);
    const record = (await run({ url: URL_A, quotes: ['cho vay mua nhà từ 7,5% một năm'] })) as Record<string, unknown>;
    expect(record).toMatchObject({ handle: 'f1', source_name: 'demo-news.example', published_display: '05/10/2026', quote_1_label: 'cho vay mua nhà từ 7,5% một năm' });
    expect(sheet.get('f1')).toBe(record);
  });

  it('refuses a page fetched in an earlier turn, and one never fetched', async () => {
    await expect(turn(false).run({ url: URL_A, quotes: ['cho vay mua nhà từ 7,5% một năm'] })).rejects.toBeInstanceOf(ToolRejection);
    await expect(turn(true).run({ url: 'https://other.example/x', quotes: ['cho vay mua nhà từ 7,5% một năm'] })).rejects.toBeInstanceOf(ToolRejection);
  });

  it('refuses one bad quote while the others mint, keeping each quote number', async () => {
    const record = (await turn(true).run({ url: URL_A, quotes: ['không có trên trang này đâu', 'Kỳ hạn vay tối đa là hai'] })) as Record<string, unknown>;
    expect(record).toMatchObject({ quote_2_label: 'Kỳ hạn vay tối đa là hai' });
    expect(record).not.toHaveProperty('quote_1_label');
    expect(record.refused).toHaveLength(1);
  });
});
