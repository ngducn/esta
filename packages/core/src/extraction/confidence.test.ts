import { describe, expect, it } from 'vitest';
import { needsCheck, REVIEW_CONFIDENCE_THRESHOLD } from './confidence';

const field = (confidence: number) => ({ leaf: { value: 'x', confidence, page: 1 } });

describe('needsCheck', () => {
  it('marks a value read below 0.9 and not one read at 0.9', () => {
    expect(REVIEW_CONFIDENCE_THRESHOLD).toBe(0.9);
    expect(needsCheck(field(0.9))).toBe(false);
    expect(needsCheck(field(0.89))).toBe(true);
  });

  it('marks an empty leaf the model gave confidence 0, and nothing on a manual entry', () => {
    expect(needsCheck({ leaf: { value: null, confidence: 0, page: null } })).toBe(true);
    expect(needsCheck({ leaf: null })).toBe(false);
  });
});
