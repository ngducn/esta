import { describe, expect, it } from 'vitest';
import { checkNote, type FactSheet, type NoteRule } from './index';

const SHEET: FactSheet = new Map([
  ['f1', { start_year_display: '2019', end_date_display: '31/12/2026', due_date_display: '05/11/2026', unit_label: 'Phòng 5', owner_name: 'Nguyễn Thị Demo' }],
]);
const rules = (note: string): NoteRule[] => {
  const checked = checkNote(note, SHEET);
  return checked.ok ? [] : checked.reason.map((v) => v.rule);
};

describe('the number guard gaps of #313', () => {
  it.each([
    'Phòng lOO còn trống.',
    'Có IOO phòng trống.',
    'Còn batriệu chưa thu.',
    'Có haimươi phòng.',
    'Có mườilăm phòng.',
    'Có Twentyfive rooms.',
    'It costs threemillion.',
    'Giá triệuđồng mỗi tháng.',
    'Nhà ở Quận Một.',
    'Khu vực quận một đông khách.',
    'Phòng số một còn trống.',
    'Hợp đồng hết hạn in May.',
    'Rent is due by May.',
    'Hết hạn từ last May.',
    'Hết hạn May {{f1.start_year_display}}.',
    'Hạn trả tháng May.',
    'Hết hạn on May.',
    'Hết hạn by May {{f1.start_year_display}}.',
    'Còn haitỷ.',
    'Còn BATỶ.',
    'Còn mườitỷ.',
    'Còn nămtỷ.',
    'Còn mộttỷ.',
    'Còn batỷ.',
    'Còn batỉ.',
    'Có haimươitư phòng.',
    'Có mườitư phòng.',
    'Còn batriệuđ.',
    "Có ba'triệu.",
    'Có hai’mươi phòng.',
    "Có twenty'five rooms.",
  ])('rejects %j', (note) => {
    expect(rules(note)).toContain('word');
  });

  it.each(['Có ɪᴏᴏ phòng trống.', 'Phòng ᴢero còn trống.', 'Có ꜱix phòng.'])('rejects the small capitals in %j', (note) => {
    expect(rules(note)).toContain('script');
  });

  it.each([
    'Có lOOk mỗi tháng.',
    'Có IOOk.',
    'Có lOOK.',
    'Có lOOtr.',
    'Có IOOtriệu.',
    'Có lOOđ.',
    'Còn trıệu.',
    'Còn TRİỆU.',
    'Có fıve rooms.',
    'Có mıllıon.',
    'Có ǀOO phòng.',
    'Có ƖOO phòng.',
    'Có lØØ phòng.',
    'Có lƟƟ phòng.',
    'Có zerø rooms.',
    'Có ƒive rooms.',
    'Có ħai phòng.',
    'Có ĥai phòng.',
    'Có ḣai phòng.',
    'Có ṫriệu.',
    'Có ṭám phòng.',
    'Có ňăm phòng.',
    'Có h\u0332a\u0332i\u0332 phòng.',
    'Có t\u0336r\u0336i\u0336ệ\u0336u\u0336.',
    'Có ba\u0332triệu.',
    'Có hai\u0332 phòng.',
  ])('rejects the look-alike letters in %j', (note) => {
    expect(rules(note).length).toBeGreaterThan(0);
  });

  it('rejects a lone byte-order mark at either end of a note', () => {
    expect(rules('\uFEFFPhòng trống.')).toContain('invisible');
    expect(rules('Phòng trống.\uFEFF')).toContain('invisible');
    expect(rules('\uFEFF\uFEFF')).toContain('invisible');
  });
});

describe('the number guard gaps of #314', () => {
  it.each(['Quý iii còn nợ.', 'Phòng iv còn trống.', 'Dãy xii đã đầy.', 'Part ii of the lease.', 'Khu viii mới xây.', 'Phòng vi.', 'Quý xi.'])('rejects the lowercase Roman numeral in %j', (note) => {
    expect(rules(note)).toContain('word');
  });

  it.each(['Có cả năm phòng trống.', 'Trong năm phòng trống.', 'Các năm phòng đã ký.', 'Còn năm nữa là hết hạn.', 'Mẹ cần sửa năm Căn nhà.', 'Có cả năm căn nhà.'])('rejects the năm that reads as five in %j', (note) => {
    expect(rules(note)).toContain('word');
  });
});

describe('a real number beside the new rules is still rejected', () => {
  it.each(['Còn batriệu và hai triệu.', 'Cả năm hai phòng trống.', 'Trong May có ba phòng.', 'Quận Một và ba phòng.', 'Còn batỷ và hai triệu.', 'Cả năm hai phòng.', 'Phòng số một và năm phòng.', 'Phòng iv còn năm phòng.', 'Hai batriệu.', 'An toàn là ưu tiên số một.', 'Vấn đề số một là tiền thuê.', 'Mối lo số một là khách trả trễ.', 'Khách hàng là số một.'])('rejects %j', (note) => {
    expect(rules(note)).toContain('word');
  });

  it('names the glued run in the repair message', () => {
    const checked = checkNote('Còn batriệu.', SHEET);
    expect(checked.ok ? [] : checked.reason).toEqual([{ rule: 'word', text: 'batriệu' }]);
  });
});

describe('ordinary prose that uses the same words stays accepted', () => {
  it.each([
    'Năm nay giá thuê ổn định.',
    'Tháng này khách trả đúng hạn.',
    'Cả năm qua Mẹ chưa phải giảm giá.',
    'Trong năm nay có khách mới.',
    'Cả năm Mẹ chỉ sửa một lần.',
    'Năm mới Mẹ nên gia hạn hợp đồng.',
    'Nhà ở Năm Căn có sân rộng.',
    'Sau đó Mẹ gọi nhắc khách.',
    'Chim bay qua sân nhà.',
    'Khách tên May Demo đã ký hợp đồng.',
    'Xưởng may nằm cạnh dãy trọ.',
    'Điều khoản vi phạm hợp đồng cần đọc kỹ.',
    'Khu vi phạm xây dựng cần báo cáo.',
    'Phần xi măng còn thừa.',
    'Khu di tích cạnh nhà.',
    'This may take a day, and it may rain in the evening.',
    'Last month the rent was paid in full.',
    'Thuê từ năm {{f1.start_year_display}}.',
    'Phòng lo lắng về giá.',
    'Cuối năm khách muốn trả phòng.',
    'Mỗi năm khách tăng giá.',
    'Hằng năm người thuê phải gia hạn.',
    'Đầu năm hợp đồng hết hạn.',
    'Trong năm bên thuê đã trả đủ.',
    'Cuối năm hộ kinh doanh phải nộp tờ khai.',
    'Mỗi năm đất tăng giá.',
    'Quanh năm khách đông.',
    'Theo năm hợp đồng, tiền thuê được điều chỉnh.',
    'Trong số một vài khách trả trễ, có khách mới.',
    'Trong số một số khách, có người trả trễ.',
    'Trong quận một số nhà đang cho thuê.',
    'Ở quận một vài dự án mới mở.',
    'Tại quận một phần đất đang chờ quy hoạch.',
    'Xem lại số một cách kỹ.',
    'Hợp đồng hết hạn {{f1.end_date_display}}. May mắn là khách muốn gia hạn.',
    'Hạn trả là {{f1.due_date_display}}. May là khách đã báo trước.',
    '- Hạn {{f1.due_date_display}}\n- May mắn khách đã trả.',
    'Lease ends {{f1.end_date_display}}. May we renew?',
    '| {{f1.due_date_display}} | May mắn đã trả |',
    'Tenants who move in may ask for a copy.',
    'The month after may be quieter.',
    'Whoever moves in next may need a deposit.',
    'The bank you pay from may charge a fee.',
    'The article is by May Demo.',
    'Tin nhắn from May Demo hôm nay.',
    'Hợp đồng ký bởi from May Demo.',
    'Ghi chú by May Demo.',
    'The Grandeur hotel is near the market.',
    'José Nguyễn mở quán café ở Đà Lạt.',
    'Müller, Peña and Zoë visited São Paulo.',
    'Baba Demo ở phòng bên.',
  ])('accepts %j', (note) => {
    expect(rules(note)).toEqual([]);
  });
});
