import { checkNote } from '@esta/core/guard';
import { describe, expect, it } from 'vitest';
import { askRepairPrompt, askSourceRepairPrompt, rejectedTexts, SOURCE_REJECT } from './ask';

describe('the text each repair turn names (P5-10d)', () => {
  it('names the texts the number guard rejected, quotation marks included', () => {
    expect(rejectedTexts(askRepairPrompt([{ rule: 'word', text: 'hai' }, { rule: 'number', text: '"5"' }]))).toEqual(['hai', '"5"']);
  });

  it('asks for the answer again without the exact rejected words', () => {
    const prompt = askRepairPrompt([{ rule: 'word', text: 'hai' }, { rule: 'word', text: 'hai' }, { rule: 'word', text: 'ba' }]);
    expect(prompt).toContain('without these exact words ("hai", "ba")');
  });

  it('names the missing official page when the repair asks for a source, which holds no rejected text', () => {
    expect(rejectedTexts(askSourceRepairPrompt())).toEqual([SOURCE_REJECT]);
  });
});

describe('the replacements the style rule suggests (P5-10d)', () => {
  it('hold no number word the guard rejects', () => {
    for (const note of ['Bố mẹ vẫn giữ nhà.', 'Bên thuê và bên cho thuê ký hợp đồng.', 'Người thuê và chủ nhà ký hợp đồng.', 'Cả người thuê lẫn chủ nhà đều đồng ý.', 'The tenant and the landlord sign.', 'An toàn là ưu tiên hàng đầu.', 'Phòng của khách là phòng quan trọng nhất.', 'Bảo hiểm cho người ngoài hợp đồng.', 'Bảo hiểm cho bên không ký hợp đồng.', 'Nên tăng giá cùng lúc cho các phòng.', 'Phí tính theo tỷ lệ tiền thuê.']) {
      expect(checkNote(note, new Map()).ok, note).toBe(true);
    }
  });
});
