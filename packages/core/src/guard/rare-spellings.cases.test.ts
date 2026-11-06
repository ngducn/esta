import { describe, expect, it } from 'vitest';
import { checkNote } from './index';
import { REFUSED_SPELLINGS } from './rare-spellings.cases';

describe('the number guard on rare spellings from the review issues', () => {
  it.each(REFUSED_SPELLINGS)('%s refuses %j', (_source, note) => {
    expect(checkNote(note, new Map()).ok).toBe(false);
  });
});
