import { describe, expect, it } from 'vitest';
import { checkNote, repairMessage } from './index';
import { PASSED_SPELLINGS, REFUSED_SPELLINGS } from './rare-spellings.cases';

describe('the number guard on rare spellings from the review issues', () => {
  it.each(REFUSED_SPELLINGS)('%s refuses %j', (_source, note) => {
    expect(checkNote(note, new Map()).ok).toBe(false);
  });

  it.each(PASSED_SPELLINGS)('%s passes %j', (_source, note) => {
    expect(checkNote(note, new Map())).toMatchObject({ ok: true });
  });

  it('tells the model to drop the stroke from a letter such as Ø, not only to write Latin letters', () => {
    const refused = checkNote('Phòng Ø còn trống.', new Map());
    if (refused.ok) throw new Error('Ø is not a Latin letter the guard reads');
    expect(repairMessage(refused.reason)).toMatch(/Drop the stroke, ring or accent/u);
  });
});
