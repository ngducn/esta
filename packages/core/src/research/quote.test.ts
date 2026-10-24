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
});
