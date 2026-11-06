import { describe, expect, it } from 'vitest';
import { askRepairPrompt, askSourceRepairPrompt, rejectedTexts, SOURCE_REJECT } from './ask';

describe('the text each repair turn names (P5-10d)', () => {
  it('names the texts the number guard rejected, quotation marks included', () => {
    expect(rejectedTexts(askRepairPrompt([{ rule: 'word', text: 'hai' }, { rule: 'number', text: '"5"' }]))).toEqual(['hai', '"5"']);
  });

  it('names the missing official page when the repair asks for a source, which holds no rejected text', () => {
    expect(rejectedTexts(askSourceRepairPrompt())).toEqual([SOURCE_REJECT]);
  });
});
