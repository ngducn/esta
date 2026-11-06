import { describe, expect, it } from 'vitest';
import { OPEN_PROSE, OPEN_PROSE_SHEET } from './fixtures/open-prose';
import { checkNote } from './index';

const rules = (note: string) => {
  const checked = checkNote(note, OPEN_PROSE_SHEET);
  return checked.ok ? [] : checked.reason.map((v) => v.rule);
};

describe('the guard on open advice and writing (AGENT.md §5.6 step 7)', () => {
  it('holds at least twenty Vietnamese and five English prompts', () => {
    expect(OPEN_PROSE.filter(({ id }) => id.startsWith('vi-')).length).toBeGreaterThanOrEqual(20);
    expect(OPEN_PROSE.filter(({ id }) => id.startsWith('en-')).length).toBeGreaterThanOrEqual(5);
  });

  it.each(OPEN_PROSE)('passes the $kind answer to $id', ({ template }) => {
    const checked = checkNote(template, OPEN_PROSE_SHEET);
    expect(checked.ok ? [] : checked.reason).toEqual([]);
  });
});

describe('the compounds the open-prose probe added (P5-12)', () => {
  it.each([
    ['đồng hành', 'Rất mong tiếp tục được đồng hành lâu dài.', ['Còn nợ hai triệu đồng.', 'Đồng hành lâu dài, còn thiếu trăm đồng.', 'Đồng hành cùng chị, còn nợ ba triệu.', 'Đồng hành, đồng.']],
    ['chín chắn', 'Đây là quyết định lớn, nên cân nhắc chín chắn.', ['Còn nợ chín triệu.', 'Có chín phòng.', 'Cân nhắc chín chắn vì còn chín tháng.']],
    ['second opinion', 'Here is a second opinion on the sale.', ['The second bill is late.', 'Room on the second floor.', 'A second opinion costs a second fee.']],
    ['double-check', 'Please double-check the deposit, or double check it at the bank.', ['Double the rent next year.', 'A double-digit rise.', 'Rent went up double.', 'Double-check the double rent.']],
  ])('%s passes, and a real number beside it is still rejected', (_compound, passing, rejected) => {
    expect(rules(passing)).toEqual([]);
    for (const note of rejected) expect(rules(note), note).toContain('word');
  });

  // The guard reads no idiom: `hai bên`, `ba mẹ` and `cả hai` are judged like any other number word, and the assistant's
  // style rule steers the model to `bố mẹ` and `cả người thuê lẫn chủ nhà` instead (P5-10d, docs/plan/trail/phase-5-guard.md).
  it('rejects hai and ba before bên or mẹ, and cả hai, whatever follows', () => {
    for (const note of [
      'Có hai bên thuê.',
      'Ba mẹ con chị Hoa thuê phòng.',
      'Còn hai bên phòng.',
      'Hai bên ký hợp đồng.',
      'Ba mẹ vẫn giữ nhà.',
      'Cả hai đều đồng ý.',
      'Tài sản chung của cả hai.',
      'Phí quản lý thường là một phần trăm tiền thu.',
      'Thuế GTGT với nhà ở cho thuê là không phần trăm.',
    ]) {
      expect(rules(note), note).toContain('word');
    }
  });

  it('rejects a third party and số một, which the style rule steers the model away from (#496)', () => {
    for (const note of ['Bảo hiểm cho bên thứ ba.', 'Phòng của khách là số một.']) expect(rules(note), note).toContain('word');
  });

  it('reads a hyphen as the space it stands for, so a date word joined by one is still rejected', () => {
    for (const note of ['Khách trả vào mùng-một.', 'Hẹn trả tháng-một.', 'Đã nộp quý-I.']) expect(rules(note), note).toContain('word');
  });
});
