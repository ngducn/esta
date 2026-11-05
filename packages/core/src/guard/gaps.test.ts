import { describe, expect, it } from 'vitest';
import { checkNote, type FactSheet, type NoteRule } from './index';

const SHEET: FactSheet = new Map([['f1', { start_year_display: '2019', unit_label: 'Phòng 5', owner_name: 'Nguyễn Thị Demo' }]]);
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
  ])('rejects %j', (note) => {
    expect(rules(note)).toContain('word');
  });

  it.each(['Có ɪᴏᴏ phòng trống.', 'Phòng ᴢero còn trống.', 'Có ꜱix phòng.'])('rejects the small capitals in %j', (note) => {
    expect(rules(note)).toContain('script');
  });

  it('rejects a lone byte-order mark at either end of a note', () => {
    expect(rules('﻿Phòng trống.')).toContain('invisible');
    expect(rules('Phòng trống.﻿')).toContain('invisible');
    expect(rules('﻿﻿')).toContain('invisible');
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
  it.each(['Còn batriệu và hai triệu.', 'Cả năm hai phòng trống.', 'Trong May có ba phòng.', 'Quận Một và ba phòng.', 'Phòng iv còn năm phòng.', 'Hai batriệu.'])('rejects %j', (note) => {
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
  ])('accepts %j', (note) => {
    expect(rules(note)).toEqual([]);
  });
});
