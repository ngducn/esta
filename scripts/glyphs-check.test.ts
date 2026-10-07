import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { vietnameseLetters } from '../apps/web/src/design/glyph-test-string.ts';

describe('vietnameseLetters', () => {
  it('lists the 146 Vietnamese letters as single precomposed code points', () => {
    expect(vietnameseLetters).toHaveLength(146);
    expect(vietnameseLetters.every((letter) => letter.normalize('NFC') === letter && [...letter].length === 1)).toBe(true);
    expect(new Set(vietnameseLetters).size).toBe(146);
    expect(vietnameseLetters).toEqual(expect.arrayContaining(['đ', 'Đ', 'ặ', 'Ặ', 'ữ', 'Ữ', 'ỵ', 'Ỵ', 'ẫ', 'ờ']));
  });
});

describe('glyphs:check', () => {
  it('checks every Vietnamese letter on top of the text it is given', () => {
    const output = execFileSync('node', ['scripts/glyphs-check.mjs', '--text', '₫'], { encoding: 'utf8' });
    const counts = [...output.matchAll(/ (\d+)\/(\d+)/g)].map((m) => Number(m[2]));
    expect(counts.length).toBeGreaterThan(0);
    expect(new Set(counts)).toEqual(new Set([147]));
  }, 60_000);
});
