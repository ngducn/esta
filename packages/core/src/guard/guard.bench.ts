import { expect, test } from 'vitest';
import { isoDate } from '../date/iso-date';
import { formatBps, formatDate, formatRelativeDue, formatVnd, formatVndCompact } from '../format';
import { vnd } from '../money/vnd';
import { checkNote, type FactSheet } from './index';

const BUDGET_MS = 5;
const today = isoDate('2026-10-07');

const SHEET: FactSheet = new Map(
  Array.from({ length: 2000 }, (_, i) => [
    `f${i + 1}`,
    {
      unit_label: `Phòng ${(i % 40) + 1}`,
      property_label: `Nhà trọ Demo ${(i % 12) + 1}`,
      outstanding_display: formatVnd(vnd(3_500_000 + i * 1_000), 'vi'),
      outstanding_compact: formatVndCompact(vnd(3_500_000 + i * 1_000), 'vi'),
      due_relative: formatRelativeDue(isoDate('2026-09-25'), today, 'vi'),
      end_display: formatDate(isoDate('2026-11-01'), 'vi'),
      progress_display: formatBps(8200 + i, 'vi'),
    },
  ]),
);

const item = (handle: number) =>
  `- **{{f${handle}.unit_label}}** ở {{f${handle}.property_label}} còn nợ tiền phòng {{f${handle}.outstanding_display}}, đã {{f${handle}.due_relative}}. Mẹ nên gọi nhắc khách trong tuần này và ghi lại kết quả cuộc gọi.`;

const NOTE = [
  '## Việc cần làm tuần này',
  '',
  ...[3, 250, 777, 1999].map(item),
  '',
  '## Hợp đồng và doanh thu',
  '',
  'Hợp đồng của {{f42.unit_label}} hết hạn ngày {{f42.end_display}}; mẹ nên hỏi khách có muốn gia hạn hay không trước khi đăng tin tìm người thuê mới.',
  'Doanh thu cho thuê năm nay đã đạt tỷ lệ {{f1200.progress_display}} so với ngưỡng, tổng cộng {{f1200.outstanding_compact}} từ đầu năm.',
  'Khoản cọc của {{f640.unit_label}} là {{f640.outstanding_display}} và vẫn đang giữ, cần đối chiếu với biên bản bàn giao trước khi hoàn lại cho khách.',
  '',
  '## Thị trường',
  '',
  'Khu vực Dĩ An đang có thêm nhiều dãy trọ mới gần các khu công nghiệp, nên giá thuê có thể chững lại trong vài tháng tới. Mẹ chưa cần giảm giá, nhưng nên giữ liên lạc với các khách đang ở lâu, sửa sớm những hỏng hóc nhỏ và chụp ảnh phòng trống thật sáng sủa để đăng tin khi cần. Trợ lý sẽ tiếp tục theo dõi tin tức và báo lại nếu có thay đổi lớn về quy hoạch hay thuế.',
  '',
  '> Ghi chú: mọi con số trong bản tin này lấy trực tiếp từ sổ sách của gia đình, không ước tính. Nếu thấy chỗ nào chưa đúng, mẹ bấm vào từng mục để xem chi tiết và sửa lại.',
].join('\n');

test('the bench note has about 300 words and 20 placeholders and passes the guard', () => {
  expect(NOTE.split(/\s+/u).length).toBeGreaterThanOrEqual(250);
  expect(NOTE.match(/\{\{/gu)).toHaveLength(22);
  expect(checkNote(NOTE, SHEET).ok).toBe(true);
});

test('checkNote stays under 5 ms for a 300-word note against 2,000 records', async ({ bench }) => {
  const result = await bench('checkNote 300 words', () => {
    checkNote(NOTE, SHEET);
  }).run();
  expect(result.latency.mean).toBeLessThan(BUDGET_MS);
});
