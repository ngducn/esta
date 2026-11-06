import { checkNote } from '@esta/core/guard';
import { describe, expect, it } from 'vitest';
import { askRepairPrompt, askSourceRepairPrompt, rejectedTexts, SOURCE_REJECT, STYLE_SWAPS } from './ask';

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
  it.each(STYLE_SWAPS)('rejects "$never" and passes each of $say', ({ never, say }) => {
    expect(checkNote(`${never}.`, new Map()).ok, never).toBe(false);
    for (const phrase of say) expect(checkNote(`${phrase}.`, new Map()).ok, phrase).toBe(true);
  });
});
