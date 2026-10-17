import { IDS } from './run';

/** Trợ lý notes over the run in `run.ts`. `expect` is `pass` or the offending substrings the guard must name, in order. */
export type Note = { readonly name: string; readonly text: string; readonly expect: 'pass' | readonly string[] };

const NBSP = ' ';

export const NOTES: readonly Note[] = [
  {
    name: 'W1 action item with the outstanding amount in both forms',
    text: [
      '**Phòng 5 (Dĩ An) quá hạn 12 ngày**',
      '',
      `Hóa đơn kỳ tháng 9 đến hạn 25/09/2026, đã trả 40.000${NBSP}₫, còn nợ 3.460.000${NBSP}₫ (khoảng 3,5 tr).`,
      `[Xem hóa đơn](esta://invoice/${IDS.room5SeptInvoice}) · [Phòng 5](esta://unit/${IDS.room5})`,
    ].join('\n'),
    expect: 'pass',
  },
  {
    name: 'grouped watch item',
    text: [
      'Theo dõi hôm nay, Thứ Tư, 07/10/2026:',
      '',
      `- Kho Biên Hòa trống 70 ngày từ 29/07/2026. [Xem](esta://unit/${IDS.bienHoaUnit})`,
      `- Phòng 8 Dĩ An trống 67 ngày, sẵn sàng từ 01/08/2026. [Xem](esta://unit/${IDS.room8})`,
      `- Bảo hiểm cháy nổ 2026 của Nhà phố Q7 hết hạn 30/10/2026, còn 23 ngày. [Xem](esta://document/${IDS.q7Insurance})`,
      `- Doanh thu dự kiến năm 2026 của Nguyễn Thị Demo là 412 tr, bằng 82,4% ngưỡng 500 tr, còn cách 88.000.000${NBSP}₫.`,
      `- Hợp đồng Nhà Thủ Đức hết hạn 01/11/2026, còn 25 ngày, tiền thuê 12.000.000${NBSP}₫/tháng. [Xem](esta://lease/${IDS.thuDucLease})`,
      `- Phòng 7 Dĩ An kết thúc ngày 15/09/2026, đã 22 ngày, còn giữ cọc 6.000.000${NBSP}₫. [Xem](esta://lease/${IDS.room7Lease})`,
      '- Đất Long An mới hoàn thiện 55% hồ sơ.',
    ].join('\n'),
    expect: 'pass',
  },
  {
    name: 'morning brief summary line with counts from collections',
    text: [
      `Tóm tắt 07/10/2026: 1 phòng quá hạn, 3 hóa đơn đến hạn trong tháng 10.`,
      `Tháng 10 đã thu 31.200.000${NBSP}₫ trên 48.500.000${NBSP}₫ dự kiến (6 bất động sản, 14 phòng, lấp đầy 78,57%).`,
      `Tổng cọc đang giữ: 42.000.000${NBSP}₫. Giá trị ước tính 18,25 tỷ (định giá ngày 30/06/2026).`,
    ].join('\n'),
    expect: 'pass',
  },
  {
    name: 'English answer with compact and exact forms',
    text: `Room 5 at Dĩ An is 12 days overdue. The September invoice was due 25/09/2026 with 3,460,000${NBSP}₫ outstanding (about 3.5M ₫). Nhà Thủ Đức rent is 12M ₫ a month.`,
    expect: 'pass',
  },
  {
    name: 'household name and property count from the context and household_info',
    text: 'Gia đình Demo 3 có 6 bất động sản và 2 thành viên.',
    expect: 'pass',
  },
  {
    name: 'wrong day count',
    text: `Phòng 5 (Dĩ An) quá hạn 13 ngày, còn nợ 3.460.000${NBSP}₫.`,
    expect: ['13 ngày'],
  },
  {
    name: 'compact amount rounded the wrong way',
    text: 'Phòng 5 còn nợ khoảng 3,4 tr.',
    expect: ['3,4 tr'],
  },
  {
    name: 'invented total',
    text: 'Tổng nợ quá hạn toàn danh mục là 50 tr.',
    expect: ['50 tr'],
  },
  {
    name: 'wrong due date',
    text: 'Hóa đơn Phòng 5 đến hạn 26/09/2026.',
    expect: ['26/09/2026'],
  },
  {
    name: 'wrong percentage of the tax threshold',
    text: 'Doanh thu dự kiến đạt 85% ngưỡng.',
    expect: ['85%'],
  },
  {
    name: 'difference computed by the model instead of a tool',
    text: `Tháng 10 còn thiếu 17.300.000${NBSP}₫ so với dự kiến.`,
    expect: [`17.300.000${NBSP}₫`],
  },
  {
    name: 'English note with two wrong numbers',
    text: 'Room 5 is 16 days overdue with 3.6M ₫ outstanding.',
    expect: ['16 days', '3.6M ₫'],
  },
  {
    name: 'a wrong small count passes when the number appears anywhere in the run (§6.3 limit: 14 is unit_count)',
    text: 'Room 5 is 14 days overdue.',
    expect: 'pass',
  },
  {
    name: 'exact amount that only matches after compact rounding',
    text: `Phòng 5 còn nợ 3.500.000${NBSP}₫ theo hóa đơn tháng 9.`,
    expect: 'pass',
  },
  {
    name: 'outstanding written exactly as 3.460.000 but the deposit misquoted',
    text: `Phòng 5 còn nợ 3.460.000${NBSP}₫, cọc đang giữ 6,5 tr.`,
    expect: ['6,5 tr'],
  },
];
