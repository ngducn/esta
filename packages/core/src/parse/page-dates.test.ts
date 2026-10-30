import { describe, expect, it } from 'vitest';
import { datesInText, PUBLISHED_LABEL, publishedDates } from './page-dates';

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
  // WebFetch returns the fetch model's answer to the scan's prompt, not the page, so these are answers of that shape.
  it('reads the date from the labelled date line, not from a quote that names a time and a date', () => {
    const answer = ['**Publication date:** 29/10/2026', '', '**Figures (verbatim):**', '- "khởi công lúc 8h00 ngày 15/11/2026"'].join('\n');
    expect([...publishedDates(answer)]).toEqual(['2026-10-29']);
  });

  it("never confirms the site header's clock when the answer copies it next to the date line", () => {
    const answer = ['Trang ghi ở đầu: "Thứ Năm, 29/10/2026 14:35 | Báo Demo"', `${PUBLISHED_LABEL}: Thứ Hai, 26/10/2026, 08:30 (GMT+7)`, '- "có hiệu lực từ 15/11/2026"'].join('\n');
    expect([...publishedDates(answer)]).toEqual(['2026-10-26']);
  });

  it('takes công bố as a date-line word, and a word inside a quote does not make a second date line', () => {
    const answer = ['Ngày công bố: 20/10/2026', '- "UBND tỉnh công bố ngày 15/11/2026 sẽ áp dụng bảng giá mới"'].join('\n');
    expect([...publishedDates(answer)]).toEqual(['2026-10-20']);
  });

  it('keeps out a related story and a date inside a link', () => {
    const answer = [
      '**Publication date:** Thứ Hai, 05/10/2026, 08:30 (GMT+7)',
      '- "Vành đai 3 đoạn qua Dĩ An"',
      'Tin liên quan: [Giá đất Dĩ An 06/10/2026](https://tintuc.example.vn/2026-10-04-gia-dat) và https://tintuc.example.vn/tin/03-10-2026-cau-moi',
    ].join('\n');
    expect([...publishedDates(answer)]).toEqual(['2026-10-05']);
  });

  it('without a labelled line, takes the lines that say when the article went up, not a clock or a header', () => {
    const answer = ['Hôm nay 07/10/2026, 14:35', 'Bài đăng ngày 05/10/2026 (bài Demo), cập nhật ngày 06/10/2026.', '- "khởi công lúc 8h00 ngày 15/11/2026"'].join('\n');
    expect([...publishedDates(answer)].toSorted()).toEqual(['2026-10-05', '2026-10-06']);
  });

  it('reads every date the answer writes when it has no date line, but never one inside a link', () => {
    expect([...publishedDates('Bài ngày 05/10/2026, xem [tin cũ](https://example.vn/2026-10-01-x) hoặc https://example.vn/02/10/2026/y.')]).toEqual(['2026-10-05']);
  });
});
