import { describe, expect, it } from 'vitest';
import { isoDate } from '../date/iso-date';
import { formatBps, formatCount, formatDate, formatDayMonth, formatRelativeDue, formatVnd, formatVndCompact } from '../format';
import { vnd } from '../money/vnd';
import { PROBES_NO_NUMBER_SHOWN, PROBES_R2A, PROBES_R2C } from './fixtures/probes';
import { checkNote, MAX_NOTE_LENGTH, repairMessage, visibleText, type FactSheet, type NoteRule, type NoteViolation } from './index';
import { WORDS } from './words';

const sheet = (records: Record<string, Readonly<Record<string, unknown>>>): FactSheet => new Map(Object.entries(records));
const EMPTY = sheet({});
const SHEET = sheet({
  f1: { count_display: '12', a_display: '3', days_overdue_display: '12', x_display: '5', unit_label: 'Phòng 5', code_display: 'a*b', days_overdue: 12, due_date: '2026-09-25' },
  f2: { b_display: '500', owner_name: 'Nguyễn Thị Demo' },
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
    ['Quá hạn &#x202E; ngày', 'bidi'],
    ['Quá hạn &#8238; ngày', 'bidi'],
    ['Quá hạn &rlm; ngày', 'bidi'],
    ['Quá hạn \u202E ngày', 'bidi'],
    ['Quá hạn <b>&#x202E;</b> ngày', 'bidi'],
    ['Còn nợ ｔｒｉệｕ', 'word'],
    ['Còn nợ tri\u00ADệu', 'word'],
    ['Còn nợ tr\u200Biệu', 'word'],
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
    expect(rules('+ + + + + + + + + Phòng trống')).toEqual(['too_long']);
    expect(rules('> > > > - > - > - Phòng trống')).toEqual(['too_long']);
    expect(rules('*a'.repeat(401))).toEqual(['too_long']);
    expect(rules('- **Nhà**\n  - *{{f1.unit_label}}*\n    - [trống](https://x)\n\n> > - Ghi chú')).toEqual([]);
    expect(rules(`**{{f2.owner_name}}** `.repeat(100))).toEqual([]);
  });

  it('lets a table word pass in the compounds it lists and near a placeholder', () => {
    for (const note of ['Hợp đồng sắp hết hạn.', 'Đồng hồ điện chưa ghi.', 'Công ty quản lý gọi.', 'Tỷ lệ lấp đầy cao.', 'Năm nay thu khá.', 'Thuê từ năm {{f1.count_display}}.', 'Trả đầu tư.', 'Mua ti vi mới.']) {
      expect(rules(note), note).toEqual([]);
    }
  });

  it('keeps the table keys in the form the guard looks them up in', () => {
    for (const key of WORDS.keys()) expect(key).toBe(key.normalize('NFKC').toLowerCase());
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
