import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { repairMessage, repairTexts, type NoteRule, type NoteViolation } from './index';

const RULES_USED: readonly NoteRule[] = ['number', 'word', 'symbol', 'script', 'layout', 'seam', 'glued', 'malformed', 'unknown_handle', 'too_long', 'invisible'];

describe('the texts a repair message names (P5-10d)', () => {
  it('reads back every text the guard rejected, whatever it holds', () => {
    const text = fc.string({ minLength: 1, maxLength: 24 }).filter((value) => !value.includes('\n') && value.trim() === value);
    const violation = fc.record({ rule: fc.constantFrom(...RULES_USED), text });
    fc.assert(
      fc.property(fc.array(violation, { minLength: 1, maxLength: 5 }), (violations: NoteViolation[]) => {
        const message = `${repairMessage(violations)}\nWrite the whole answer again from the start with these fixed. The handles you already have still hold.`;
        expect(repairTexts(message)).toEqual([...new Set(violations.map(({ rule, text: found }) => `${rule}\u0000${found}`))].map((key) => key.slice(key.indexOf('\u0000') + 1)));
      }),
      { seed: 20261107, numRuns: 300 },
    );
  });

  it('reads a text with quotes in it, as a number written in quotation marks has', () => {
    const message = repairMessage([{ rule: 'number', text: '"5":' }, { rule: 'word', text: 'hai' }]);
    expect(repairTexts(message)).toEqual(['"5":', 'hai']);
  });
});
