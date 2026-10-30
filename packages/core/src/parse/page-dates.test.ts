import { describe, expect, it } from 'vitest';
import { datesInText, publishedDates } from './page-dates';

describe('datesInText', () => {
  it('reads day-first dates with any separator, ISO dates and the spelled-out Vietnamese form', () => {
    const dates = datesInText('Đăng 5/10/2026, sửa 06-10-2026, lưu 2026-10-07; hiệu lực từ ngày 15 tháng 11 năm 2026 hoặc 1 tháng 1, 2027.');
    expect([...dates].toSorted()).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-11-15', '2027-01-01']);
  });

  it('skips impossible days and digits glued to a longer number', () => {
    expect([...datesInText('Số 31/02/2026 và mã 105/10/20261.')]).toEqual([]);
  });
});

describe('publishedDates (#329)', () => {
  const article = [
    'Thứ Tư, 07/10/2026 | Tin tức Demo',
    '# Vành đai 3 đoạn qua Dĩ An sắp khởi công',
    'Thứ Hai, 05/10/2026, 08:30 (GMT+7)',
    'Dự án có hiệu lực từ 15/11/2026.',
    'Tin liên quan: [Giá đất Dĩ An 06/10/2026](https://tintuc.example.vn/2026-10-04-gia-dat) và https://tintuc.example.vn/tin/03-10-2026-cau-moi',
  ].join('\n');

  it("reads the article's own date line, not the site header's date or a related story's", () => {
    expect([...publishedDates(article)]).toEqual(['2026-10-05']);
  });

  it('takes a date line from a word that says when the page was published', () => {
    expect([...publishedDates('Hôm nay 07/10/2026\nCập nhật ngày 04/10/2026\nPublished 2026-10-03')].toSorted()).toEqual(['2026-10-03', '2026-10-04']);
  });

  it('reads every date the text writes when the page has no date line, but never one inside a link', () => {
    expect([...publishedDates('Bài ngày 05/10/2026, xem [tin cũ](https://example.vn/2026-10-01-x) hoặc https://example.vn/02/10/2026/y.')]).toEqual(['2026-10-05']);
  });
});

