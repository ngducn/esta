import { describe, expect, it } from 'vitest';
import { quoteOnPage } from './quote';

const PAGE = 'Bài đăng ngày 05/10/2026. Giá thuê tăng 150 nghìn đồng mỗi tháng, theo Vành đai 3 và Quyết định số 12/2026/QĐ-UBND.';

describe('quoteOnPage (AGENT.md §5.2)', () => {
  it('accepts a quote of three or more words the page holds whole, spaced as the page spaces it', () => {
    expect(quoteOnPage('theo  Vành đai 3', PAGE)).toEqual({ ok: true, value: 'theo Vành đai 3' });
    expect(quoteOnPage('Quyết định số 12/2026/QĐ-UBND.', PAGE)).toEqual({ ok: true, value: 'Quyết định số 12/2026/QĐ-UBND.' });
  });

  it('refuses a lone figure or a two-word quote, however exactly it is copied', () => {
    expect(quoteOnPage('9', PAGE)).toEqual({ ok: false, reason: 'too_short' });
    expect(quoteOnPage('Vành đai', PAGE)).toEqual({ ok: false, reason: 'too_short' });
  });

  it('refuses a figure that matches only inside a longer number or word', () => {
    expect(quoteOnPage('tăng 50 nghìn', 'Giá thuê tăng 150 nghìn đồng.')).toEqual({ ok: false, reason: 'not_on_page' });
    expect(quoteOnPage('tăng 15 nghìn', 'Giá thuê tăng 15 nghìnđồng.')).toEqual({ ok: false, reason: 'not_on_page' });
    expect(quoteOnPage('đai 3 và', 'Vành đai 30 và đai 3 vàng')).toEqual({ ok: false, reason: 'not_on_page' });
    expect(quoteOnPage('đai 3 và', 'Vành đai 30 và, rồi đai 3 và cầu')).toEqual({ ok: true, value: 'đai 3 và' });
  });

  it('reads . , and / between digits as part of the number on both edges, and a symbol next to a digit as inside it', () => {
    const inside: ReadonlyArray<readonly [string, string]> = [
      ['500 tỷ đồng', 'Dự án vốn 1.500 tỷ đồng.'],
      ['50 triệu đồng/m2', 'Giá 2,50 triệu đồng/m2.'],
      ['tăng giá 1', 'Đất tăng giá 1.500.000 đồng.'],
      ['giảm còn 5', 'Giá giảm còn 5,5 tỷ.'],
      ['% giá cả', 'Tăng 15% giá cả.'],
      ['2026/QĐ-UBND theo quyết định', 'Số 12/2026/QĐ-UBND theo quyết định.'],
      ['theo quyết định 12/', 'theo quyết định 12/2026.'],
    ];
    for (const [quote, page] of inside) expect(quoteOnPage(quote, page), quote).toEqual({ ok: false, reason: 'not_on_page' });
    expect(quoteOnPage('vốn 1.500 tỷ đồng.', 'Dự án vốn 1.500 tỷ đồng. Khởi công 2027.')).toEqual({ ok: true, value: 'vốn 1.500 tỷ đồng.' });
    expect(quoteOnPage('còn 5,5 tỷ', 'Giá giảm còn 5,5 tỷ, theo sở.')).toEqual({ ok: true, value: 'còn 5,5 tỷ' });
  });
});
