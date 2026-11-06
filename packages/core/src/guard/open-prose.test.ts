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
    ['bên thứ ba', 'Bảo hiểm trách nhiệm với bên thứ ba.', ['Hẹn trả vào thứ ba.', 'Thứ ba bên thuê trả.', 'Bên thứ ba trả ba triệu.', 'Có ba bên thuê.']],
    ['đồng hành', 'Rất mong tiếp tục được đồng hành lâu dài.', ['Còn nợ hai triệu đồng.', 'Đồng hành lâu dài, còn thiếu trăm đồng.', 'Đồng hành cùng chị, còn nợ ba triệu.', 'Đồng hành, đồng.']],
    ['chín chắn', 'Đây là quyết định lớn, nên cân nhắc chín chắn.', ['Còn nợ chín triệu.', 'Có chín phòng.', 'Cân nhắc chín chắn vì còn chín tháng.']],
    ['second opinion', 'Here is a second opinion on the sale.', ['The second bill is late.', 'Room on the second floor.', 'A second opinion costs a second fee.']],
    ['double-check', 'Please double-check the deposit, or double check it at the bank.', ['Double the rent next year.', 'A double-digit rise.', 'Rent went up double.', 'Double-check the double rent.']],
  ])('%s passes, and a real number beside it is still rejected', (_compound, passing, rejected) => {
    expect(rules(passing)).toEqual([]);
    for (const note of rejected) expect(rules(note), note).toContain('word');
  });

  // `hai bên` (both parties) and `ba mẹ` (parents) are written the same as a count of tenants or a family of three, so
  // each passes only in the contexts of `passesInPhrases`, and a count is still rejected and rewritten by the repair turn.
  it('rejects hai and ba before bên or mẹ where they count people', () => {
    for (const note of [
      'Có hai bên thuê.',
      'Ba mẹ con chị Hoa thuê phòng.',
      'Còn hai bên phòng.',
      'Hai bên thuê chưa từng trả trễ.',
      'Cả hai chủ sở hữu chưa vượt ngưỡng.',
      'Có ba mẹ ba con.',
      'Ba mẹ ba mẹ.',
      'Sổ của mẹ và ba căn hộ cho thuê đều đã cập nhật.',
      'Mẹ và ba người con.',
      'Ba và mẹ con chị Hoa thuê phòng.',
      'Tiền cọc của hai bên thuê đã nhận đủ.',
      'Cả hai bên thuê đã trả.',
      'Có hai bên đã đặt cọc giữ phòng.',
      'Có hai bên không trả tiền đúng hạn.',
      'Phí quản lý thường là một phần trăm tiền thu.',
      'Thuế GTGT với nhà ở cho thuê là không phần trăm.',
      'Tháng này đã có thêm hai bên ký hợp đồng thuê.',
      'Có tới hai bên cùng muốn thuê căn này.',
      'Đã tìm được hai bên ký hợp đồng thuê.',
      'Đã có tổng cộng hai bên ký hợp đồng.',
      'Chỉ hai bên ký hợp đồng, các phòng còn lại trống.',
      'Tổng số bên thuê là hai bên.',
      'Số bên đã ký hợp đồng: hai bên.',
      'Nhà đã cho thuê hai bên, mỗi bên một tầng.',
      'Mẹ cho hai bên cùng thuê.',
      'Mẹ cho “hai bên” thuê nhà.',
      'Có, hai bên ký hợp đồng thuê.',
      'Hiện cả hai đều chưa vượt ngưỡng.',
    ]) {
      expect(rules(note), note).toContain('word');
    }
  });

  it('passes hai bên as both parties, ba mẹ as parents and cả hai as both, where they state no figure', () => {
    for (const note of ['Hai bên ký hợp đồng.', 'Hai bên đồng ý tăng giá.', 'Hai bên thống nhất giá thuê.', 'Giữa hai bên có thỏa thuận.', 'Ba mẹ muốn để lại nhà cho các con.', 'Ba hoặc mẹ đứng tên.', 'Tài sản chung của cả hai.', 'Cả hai đều đồng ý.', 'Tính theo phần trăm tiền thu được.']) {
      expect(rules(note), note).toEqual([]);
    }
  });

  it('reads a hyphen as the space it stands for, so a date word joined by one is still rejected', () => {
    for (const note of ['Khách trả vào mùng-một.', 'Hẹn trả tháng-một.', 'Đã nộp quý-I.']) expect(rules(note), note).toContain('word');
  });
});
