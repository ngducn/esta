import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { nationalIdTestPath, renderNationalIdTest } from './national-id-vectors.ts';

describe('national ID vectors', () => {
  it('the pgTAP test holds the current vectors (run node scripts/national-id-vectors.ts)', () => {
    expect(readFileSync(nationalIdTestPath, 'utf8')).toBe(renderNationalIdTest());
  });
});
