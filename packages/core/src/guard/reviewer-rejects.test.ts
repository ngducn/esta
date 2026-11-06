import { describe, expect, it } from 'vitest';
import { REVIEWER_SENTENCES } from './fixtures/reviewer-rejects';
import { checkNote } from './index';

describe('the sentences reviewers showed the guard letting through (P5-10d)', () => {
  it.each(REVIEWER_SENTENCES)('rejects %j', (sentence) => {
    expect(checkNote(sentence, new Map()).ok).toBe(false);
  });
});
