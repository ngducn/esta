import { describe, expect, it } from 'vitest';
import { isoDate } from '../date/iso-date';
import { formatBps, formatCount, formatDate, formatDayMonth, formatRelativeDue, formatVnd, formatVndCompact } from '../format';
import { vnd } from '../money/vnd';
import { PROBES_NO_NUMBER_SHOWN, PROBES_R2A, PROBES_R2C } from './fixtures/probes';
import { checkNote, MAX_NOTE_LENGTH, MAX_VALUE_LENGTH, repairMessage, visibleText, type FactSheet, type NoteRule, type NoteViolation } from './index';
import { WORDS } from './words';

const sheet = (records: Record<string, Readonly<Record<string, unknown>>>): FactSheet => new Map(Object.entries(records));
const EMPTY = sheet({});
const SHEET = sheet({
  f1: {
    count_display: '12',
    a_display: '3',
    days_overdue_display: '12',
    x_display: '5',
    unit_label: 'Phòng 5',
    property_label: 'Nhà trọ Demo',
    code_display: 'a*b',
    day_display: '05',
    month_display: '10',
    start_year_display: '2019',
    days_overdue: 12,
    due_date: '2026-09-25',
  },
  f2: { b_display: '500', owner_name: 'Nguyễn Thị Demo', year_display: '2026' },
});

function violations(template: string, facts: FactSheet = SHEET): NoteViolation[] {
  const result = checkNote(template, facts);
  return result.ok ? [] : result.reason;
}
const rules = (template: string, facts: FactSheet = SHEET): NoteRule[] => violations(template, facts).map((v) => v.rule);
function filled(template: string, facts: FactSheet): string {
  const result = checkNote(template, facts);
  if (!result.ok) throw new Error(`rejected ${JSON.stringify(template)}: ${JSON.stringify(result.reason)}`);
  return result.value.text;
}

describe('the adversarial probes of #309', () => {
  it.each(PROBES_R2A)('rejects the R2A probe %j', (text) => {
    expect(checkNote(text, EMPTY).ok).toBe(false);
  });
  it.each(PROBES_R2C)('rejects the R2C probe %j', (text) => {
    expect(checkNote(text, EMPTY).ok).toBe(false);
  });
  it.each(PROBES_NO_NUMBER_SHOWN)('accepts %j, which shows no number', (text) => {
    expect(checkNote(text, EMPTY).ok).toBe(true);
  });
});

describe('model text without digits', () => {
  it.each<[string, NoteRule]>([
    ['Còn nợ &#49; triệu', 'number'],
    ['Còn nợ &#x31; triệu', 'number'],
    ['Quá hạn &#x202E; ngày', 'invisible'],
    ['Quá hạn &#8238; ngày', 'invisible'],
    ['Quá hạn &rlm; ngày', 'invisible'],
    ['Quá hạn \u202E ngày', 'invisible'],
    ['Quá hạn <b>&#x202E;</b> ngày', 'invisible'],
    ['Còn nợ ｔｒｉệｕ', 'word'],
    ['Còn nợ tri\u00ADệu', 'invisible'],
    ['Còn nợ tr\u200Biệu', 'invisible'],
    ['Còn nợ тriệu', 'script'],
    ['Còn nợ 三百万', 'script'],
    ['Còn nợ ba triệu rưỡi', 'word'],
    ['Quá hạn hai mươi lăm ngày', 'word'],
    ['Có năm phòng trống', 'word'],
    ['Overdue by twelve days', 'word'],
    ['The lease is due in October', 'word'],
    ["The lease ends October's end", 'word'],
    ['Còn nợ {{f1.days_overdue_display}} triệu', 'word'],
    ['Còn {{f1.count_display}}k', 'glued'],
    ['Còn {{f1.count_display}}k', 'word'],
    ['Nợ {{f1.a_display}}.{{f2.b_display}}', 'seam'],
    ['Nợ **{{f1.a_display}}**,**{{f2.b_display}}**', 'seam'],
    ['Nợ {{ f1.x_display }}', 'malformed'],
    ['Nợ {f1.x_display}', 'malformed'],
    ['Nợ \uE000 rồi', 'malformed'],
    ['Trước ![năm tỷ](https://x/a.png) sau', 'word'],
    ['Trước ![5 tỷ](https://x/a.png) sau', 'number'],
    ['Xem [nguồn](https://x "12 triệu")', 'number'],
    ['Mã `{{f1.code_display}}`', 'layout'],
    ['<div>\n{{f1.code_display}}\n</div>', 'layout'],
  ])('rejects %j as %s', (template, rule) => {
    expect(rules(template)).toContain(rule);
  });

  it.each([
    ['Giá ₫ cao', 'symbol', '₫'],
    ['Tăng % so với', 'symbol', '%'],
    ['Phí ‰ mỗi năm', 'symbol', '‰'],
    ['Hạn {{f1.unit_label}}x', 'glued', '{{f1.unit_label}}x'],
  ])('rejects %j as %s, naming %j', (template, rule, text) => {
    expect(violations(template)).toContainEqual({ rule, text });
  });

  it('rejects a note longer than the cap before reading it', () => {
    expect(violations('a'.repeat(MAX_NOTE_LENGTH + 1))).toEqual([{ rule: 'too_long', text: `${MAX_NOTE_LENGTH + 1} > ${MAX_NOTE_LENGTH}` }]);
    expect(checkNote('a'.repeat(MAX_NOTE_LENGTH), EMPTY).ok).toBe(true);
  });

  it('rejects Markdown the parser slows down on, and keeps ordinary nesting and emphasis', () => {
    expect(rules('Phòng trống\n'.repeat(150).trimEnd())).toEqual([]);
    expect(rules('Phòng trống\n'.repeat(151).trimEnd())).toEqual(['too_long']);
    expect(rules('a\n=\n'.repeat(100))).toEqual(['too_long']);
    expect(rules('+ + + + + + + + + Phòng trống')).toEqual(['too_long']);
    expect(rules('> > > > - > - > - Phòng trống')).toEqual(['too_long']);
    expect(rules('*a'.repeat(401))).toEqual(['too_long']);
    expect(rules('- **Nhà**\n  - *{{f1.unit_label}}*\n    - [trống](https://x)\n\n> > - Ghi chú')).toEqual([]);
    expect(rules(`**{{f2.owner_name}}** `.repeat(100))).toEqual([]);
  });

  it('lets a table word pass in the compounds it lists and near a placeholder', () => {
    for (const note of ['Hợp đồng sắp hết hạn.', 'Đồng hồ điện chưa ghi.', 'Công ty quản lý gọi.', 'Tỷ lệ lấp đầy cao.', 'Năm nay thu khá.', 'Thuê từ năm {{f1.start_year_display}}.', 'Trả đầu tư.', 'Mua ti vi mới.']) {
      expect(rules(note), note).toEqual([]);
    }
  });

  it('keeps the table keys in the form the guard looks them up in', () => {
    for (const key of WORDS.keys()) expect(key).toBe(key.normalize('NFKC').toLowerCase());
  });
});

describe('the review probes of #311', () => {
  it.each<[string, NoteRule]>([
    ['Thuế cho thuê quý III cần nộp sớm.', 'word'],
    ['Kê khai thuế quý IV của {{f1.unit_label}}.', 'word'],
    ['Đã nộp quý I.', 'word'],
    ['Phòng IV còn trống.', 'word'],
    ['Tầng II đang sửa.', 'word'],
    ['Khách ở dãy XII trả trễ.', 'word'],
    ['Room VII is overdue.', 'word'],
    ['Theo Điều XIV của hợp đồng.', 'word'],
    ['Ký từ mmxxvi.', 'word'],
    ['Còn nợ ba&#8203;triệu.', 'invisible'],
    ['Còn nợ tri&shy;ệu.', 'invisible'],
    ['Còn nợ tri&ZeroWidthSpace;ệu.', 'invisible'],
    ['Còn nợ tri\u2060ệu.', 'invisible'],
    ['Nợ {{f1.a_display}}&#8203;{{f2.b_display}}', 'invisible'],
    ['Nợ {{f1.a_display}}/{{f2.b_display}}', 'seam'],
    ['Nợ {{f1.a_display}}-{{f2.b_display}}', 'seam'],
    ['Nợ {{f1.a_display}}:{{f2.b_display}}', 'seam'],
    ['Nợ {{f1.a_display}}–{{f2.b_display}}', 'seam'],
    ['Nợ {{f1.a_display}}^{{f2.b_display}}', 'seam'],
    ['Nợ {{f1.a_display}}*{{f2.b_display}}', 'seam'],
    ['Nợ {{f1.a_display}}_{{f2.b_display}}', 'seam'],
    ['Ngày {{f1.day_display}}/{{f1.month_display}}/{{f2.year_display}}', 'seam'],
    ['Mẹ có năm {{f1.property_label}} đang trống.', 'word'],
    ['{{f1.unit_label}} năm tháng chưa trả tiền.', 'word'],
    ['Thuê từ năm {{f1.count_display}}.', 'word'],
    ['Hạn đóng tiền là mùng một hằng tháng.', 'word'],
    ['Hạn nộp là mồng một.', 'word'],
    ['Hợp đồng hết hạn tháng một.', 'word'],
    ['Khách hẹn trả vào hăm sau.', 'word'],
    ['Thu tiền vào ngày rằm.', 'word'],
    ['Thợ tới vào chủ nhật.', 'word'],
    ['Khách thứ nhất đã trả.', 'word'],
    ['Phòng đạt 💯 điểm.', 'symbol'],
    ['Còn 🔟 ngày.', 'symbol'],
    ['Còn #\u20E3 ngày.', 'symbol'],
    ['Tăng ％ so với', 'symbol'],
    ['Tăng ٪ so với', 'symbol'],
    ['Tăng ﹪ so với', 'symbol'],
    ['Ranked thirteenth of all.', 'word'],
    ['This is the twentieth day overdue.', 'word'],
    ['Rent is a hundredth of the value.', 'word'],
    ['The building has a score of rooms.', 'word'],
    ['Lease runs a fortnight.', 'word'],
    ['Rent rose twofold.', 'word'],
    ['Rent is nought.', 'word'],
    ['Nil vacancy this month.', 'word'],
    ['Còn {{f1.count_display}} k', 'word'],
    ['Cách chợ {{f1.count_display}} m', 'word'],
    ['Còn nợ ba k', 'word'],
  ])('rejects %j as %s', (template, rule) => {
    expect(rules(template)).toContain(rule);
  });

  it.each([
    'Xu hướng giá thuê ở Dĩ An đang chững lại.',
    'Xu thế chung là giá tăng chậm.',
    'Tỷ suất cho thuê khá tốt.',
    'Tỉ suất lợi nhuận ổn định.',
    'Tỷ giá đang ổn định.',
    'Tỉ mỉ kiểm tra biên bản bàn giao.',
    'Bất đồng giữa các khách thuê.',
    'Giá thuê tương đồng với khu bên cạnh.',
    'Nhà nằm cạnh cánh đồng lúa.',
    'Sổ đỏ đứng tên đồng sở hữu của {{f2.owner_name}}.',
    'Các đồng thừa kế cần ký văn bản thỏa thuận.',
    'Cần sự đồng thuận của tất cả chủ sở hữu.',
    'Khách đồng tình với mức giá mới.',
    'Họ là đồng chủ sở hữu.',
    'Họ đồng thuê một phòng.',
    'Nhà ở vùng đồng bằng.',
    'Đồng phục bảo vệ mới.',
    'Thị trường Đồng Nai có nhiều dãy trọ mới.',
    'Nhà ở Đồng Tháp, Đồng Xoài và Đồng Hới đều trống.',
    'Theo thông tư mới của Bộ Tài chính, mẹ cần kê khai lại.',
    'Chi phí linh tinh trong tháng khá nhiều.',
    'Khách hẹn trả vào ngày mốt.',
    'Khách thuê lâu năm vừa báo chuyển đi.',
    'Giá thuê có thể tăng trong vài năm nữa.',
    'Mấy năm gần đây giá ổn định.',
    'Nhà có khách quanh năm.',
    'Khách đã ở được một năm.',
    'Doanh thu năm qua tăng đều.',
    'Doanh thu năm rồi thấp hơn.',
    'Mẹ nhớ nộp thuế trước Tết năm mới.',
    'Năm kia giá còn thấp.',
    'Năm đó khách đông.',
    'Năm này thu khá.',
    'Kỳ tính thuế năm dương lịch kết thúc cuối tháng.',
    'Tết theo năm âm lịch.',
    'Năm tính thuế này doanh thu gần ngưỡng.',
    'Báo cáo năm tài chính đã xong.',
    'Sinh viên thuê theo năm học.',
    'Năm đầu khách trả đúng hạn.',
    'Năm cuối hợp đồng cần xem lại giá.',
    'Năm thuế này cần kê khai sớm.',
    'Năm vừa qua thu khá.',
    'Nhà ở Năm Căn vẫn chưa có khách.',
    'Thuê từ năm {{f1.start_year_display}}.',
    'Khách ở dãy B trả trễ.',
    'Tòa B còn trống.',
    'The tenant in Block B paid.',
    'Khu D đang sửa.',
    'Lô M đã bán.',
    'Mỗi tháng một lần mẹ ghi điện.',
    'Hồ sơ cần CCCD hoặc CMND.',
    'Phòng VIP có ban công.',
    'Công ty LLC đã ký.',
    'Bản HD đã gửi.',
    'Sơn MIX đã mua.',
  ])('accepts %j', (note) => {
    expect(violations(note)).toEqual([]);
  });

  it('keeps rejecting nicknames and place names that are number words; the prompt asks for _name and _label fields', () => {
    for (const note of ['Chú Ba ở {{f1.unit_label}} đã trả.', 'Cô Tư hỏi về hợp đồng.', 'Căn hộ ở Hai Bà Trưng đang trống.', 'Sổ vẫn đứng tên ba.']) {
      expect(rules(note), note).toContain('word');
    }
  });
});

describe('filling placeholders', () => {
  const RUN_A = sheet({ f1: { unit_label: 'Phòng 5' }, f2: { unit_label: 'Phòng 7' } });
  const RUN_B = sheet({ f1: { unit_label: 'Phòng 5' }, f2: { unit_label: 'Phòng 7' }, f3: { unit_label: 'Phòng 8' } });

  it.each<[string, NoteRule]>([
    ['Nợ {{f9.x_display}}', 'unknown_handle'],
    ['Nợ {{f1.nope_display}}', 'unknown_field'],
    ['Nợ {{f1.constructor}}', 'unknown_field'],
    ['Quá hạn {{f1.days_overdue}} ngày', 'not_citable'],
    ['Hạn {{f1.due_date}}', 'not_citable'],
  ])('rejects %j as %s', (template, rule) => {
    expect(violations(template)).toEqual([{ rule, text: template.slice(template.indexOf('{{'), template.indexOf('}}') + 2) }]);
  });

  it('rejects a handle that only another run holds', () => {
    expect(rules('{{f3.unit_label}} trống', RUN_A)).toEqual(['unknown_handle']);
    expect(filled('{{f3.unit_label}} trống', RUN_B)).toBe('Phòng 8 trống');
  });

  it.each(['Phòng\u202E 5', 'Phòng \uE001', 'Phòng\u0007 5'])('rejects the value %j as unsafe', (value) => {
    expect(rules('Xem {{f1.unit_label}}', sheet({ f1: { unit_label: value } }))).toEqual(['unsafe_value']);
  });

  it('rejects a value longer than the cap as unsafe', () => {
    expect(rules('Xem {{f1.unit_label}}', sheet({ f1: { unit_label: 'a'.repeat(MAX_VALUE_LENGTH + 1) } }))).toEqual(['unsafe_value']);
    expect(rules('Xem {{f1.unit_label}}', sheet({ f1: { unit_label: 'a'.repeat(MAX_VALUE_LENGTH) } }))).toEqual([]);
  });

  it.each(['', '  ', ' \n '])('rejects the blank value %j with a hint to say it is missing', (value) => {
    const found = violations('Xem {{f1.unit_label}}', sheet({ f1: { unit_label: value } }));
    expect(found).toEqual([{ rule: 'empty_value', text: '{{f1.unit_label}}' }]);
    expect(repairMessage(found)).toContain('missing');
  });

  it('rejects a note that grows past the filled cap', () => {
    const long = sheet({ f1: { unit_label: '*'.repeat(MAX_VALUE_LENGTH) } });
    expect(rules('{{f1.unit_label}} và '.repeat(9), long)).toEqual([]);
    expect(rules('{{f1.unit_label}} và '.repeat(10), long)).toEqual(['too_long']);
  });

  it('escapes Markdown in a value so it renders as typed, and lists what it cited', () => {
    const result = checkNote('Xem {{f1.unit_label}} ở {{f1.property_label}}.', sheet({ f1: { unit_label: 'Phòng *VIP* [A]', property_label: 'Nhà\ntrọ  ' } }));
    expect(result).toEqual({
      ok: true,
      value: {
        text: 'Xem Phòng \\*VIP\\* \\[A\\] ở Nhà trọ.',
        template: 'Xem {{f1.unit_label}} ở {{f1.property_label}}.',
        cited: [
          { placeholder: '{{f1.unit_label}}', value: 'Phòng *VIP* [A]' },
          { placeholder: '{{f1.property_label}}', value: 'Nhà trọ' },
        ],
      },
    });
    expect(visibleText(result.ok ? result.value.text : '')).toBe('Xem Phòng *VIP* [A] ở Nhà trọ.');
  });

  it('rejects a value that starts a list when filled', () => {
    expect(rules('{{f1.count_display}}. Phòng trống')).toEqual(['layout']);
  });
});

describe('realistic notes fill to what packages/core/src/format writes', () => {
  const today = isoDate('2026-10-07');
  const NBSP = '\u00A0';
  const WATCH = sheet({
    f1: {
      unit_label: 'Phòng 5',
      property_label: 'Nhà trọ Dĩ An Demo',
      outstanding_display: formatVnd(vnd(3_500_000), 'vi'),
      outstanding_compact: formatVndCompact(vnd(3_500_000), 'vi'),
      due_relative: formatRelativeDue(isoDate('2026-09-25'), today, 'vi'),
    },
    f2: { lease_label: 'Nhà phố Q7', end_relative: formatRelativeDue(isoDate('2026-11-01'), today, 'vi'), end_display: formatDate(isoDate('2026-11-01'), 'vi') },
    f3: { unit_label: 'Phòng 8', vacant_since_display: formatDayMonth(isoDate('2026-08-01'), 'vi'), vacant_days_display: formatCount(67, 'vi') },
    f4: { unit_label: 'Phòng 7', deposit_display: formatVnd(vnd(7_000_000), 'vi'), end_display: formatDate(isoDate('2026-09-15'), 'vi') },
    f5: {
      owner_name: 'Nguyễn Thị Demo',
      household_name: 'Gia đình Demo 3',
      revenue_compact: formatVndCompact(vnd(410_000_000), 'vi'),
      progress_display: formatBps(8200, 'vi'),
      threshold_compact: formatVndCompact(vnd(500_000_000), 'vi'),
      tax_year_display: '2026',
    },
    f6: { unit_label: 'Room 5', outstanding_display: formatVnd(vnd(3_500_000), 'en'), due_relative: formatRelativeDue(isoDate('2026-09-25'), today, 'en') },
  });

  it.each([
    ['Tiền phòng {{f1.outstanding_display}} của {{f1.unit_label}} đã {{f1.due_relative}}.', `Tiền phòng 3.500.000${NBSP}₫ của Phòng 5 đã quá hạn 12 ngày.`],
    ['Hợp đồng {{f2.lease_label}} hết hạn ngày {{f2.end_display}}, {{f2.end_relative}}.', 'Hợp đồng Nhà phố Q7 hết hạn ngày 01/11/2026, còn 25 ngày.'],
    ['{{f3.unit_label}} trống từ {{f3.vacant_since_display}}, đã {{f3.vacant_days_display}} ngày chưa có khách.', 'Phòng 8 trống từ 01/08, đã 67 ngày chưa có khách.'],
    [
      'Hợp đồng {{f4.unit_label}} kết thúc ngày {{f4.end_display}} nhưng tiền cọc {{f4.deposit_display}} chưa hoàn.',
      `Hợp đồng Phòng 7 kết thúc ngày 15/09/2026 nhưng tiền cọc 7.000.000${NBSP}₫ chưa hoàn.`,
    ],
    [
      'Doanh thu cho thuê năm nay của {{f5.owner_name}} là {{f5.revenue_compact}}, tỷ lệ {{f5.progress_display}} so với ngưỡng {{f5.threshold_compact}} của năm {{f5.tax_year_display}}.',
      'Doanh thu cho thuê năm nay của Nguyễn Thị Demo là 410 tr, tỷ lệ 82% so với ngưỡng 500 tr của năm 2026.',
    ],
    [
      '- **{{f1.unit_label}}** ở [{{f1.property_label}}](esta://property/3f1c2a9e-5b7d-4c1a-9e2f-7a6b5c4d3e2f): {{f1.outstanding_compact}}, {{f1.due_relative}}\n- {{f5.household_name}} cần xem lại',
      '- **Phòng 5** ở [Nhà trọ Dĩ An Demo](esta://property/3f1c2a9e-5b7d-4c1a-9e2f-7a6b5c4d3e2f): 3,5 tr, quá hạn 12 ngày\n- Gia đình Demo 3 cần xem lại',
    ],
    ['{{f6.unit_label}} owes {{f6.outstanding_display}}, now {{f6.due_relative}}.', `Room 5 owes 3,500,000${NBSP}₫, now 12 days overdue.`],
  ])('fills %j', (template, text) => {
    expect(filled(template, WATCH)).toBe(text);
  });
});

describe('repairMessage', () => {
  it('names every offending text once with its hint', () => {
    const found = violations('Còn nợ 12 triệu, quá hạn 12 ngày, {{f9.x_display}}');
    const message = repairMessage(found);
    expect(found.map((v) => v.rule).toSorted()).toEqual(['number', 'unknown_handle', 'word']);
    for (const text of ['"12"', '"triệu"', '"{{f9.x_display}}"']) expect(message.split(text)).toHaveLength(2);
    expect(message).toContain('{{fN.field}}');
  });
});

describe('a plain-text note, such as a title', () => {
  const plain = (template: string) => checkNote(template, SHEET, 'plain');

  it('reads the literal text, so an entity or Markdown syntax hides nothing', () => {
    for (const template of ['Phòng &#53; quá hạn', '`12` ngày', '[x](https://a/1)']) {
      const result = plain(template);
      expect(result.ok, template).toBe(false);
      if (!result.ok) expect(result.reason.map((v) => v.rule)).toContain('number');
    }
  });

  it('fills a value as written, with no Markdown escape', () => {
    const result = plain('{{f1.unit_label}} có mã {{f1.code_display}}');
    expect(result.ok && result.value.text).toBe('Phòng 5 có mã a*b');
  });

  it('still rejects a typed number and an unknown field', () => {
    expect(plain('Phòng 5 quá hạn').ok).toBe(false);
    const unknown = plain('{{f1.missing_display}} quá hạn');
    expect(!unknown.ok && unknown.reason.map((v) => v.rule)).toEqual(['unknown_field']);
  });
});
