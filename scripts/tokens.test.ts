import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { brandHeadlines, brandMinimumLeading, leading, minimumLeading, typeStyles, typefaces } from '../apps/web/src/design/tokens.ts';

describe('leading', () => {
  it(`keeps every line height at ${minimumLeading} or more`, () => {
    expect(Object.entries(leading).filter(([, value]) => value < minimumLeading)).toEqual([]);
    expect(Object.entries(typeStyles).filter(([, style]) => style.linePx / style.px < minimumLeading)).toEqual([]);
  });

  it(`keeps every brand headline at ${brandMinimumLeading} or more`, () => {
    expect(Object.entries(brandHeadlines).filter(([, style]) => style.leading < brandMinimumLeading)).toEqual([]);
  });

  it('sets every type style on a whole number of 2 px steps, as the design system does', () => {
    expect(Object.entries(typeStyles).filter(([, style]) => style.linePx % 2 !== 0)).toEqual([]);
  });
});

describe('fonts.ts', () => {
  // next/font only accepts literal options, so fonts.ts restates what `typefaces` declares.
  const source = ['fonts.ts', 'display-font.ts']
    .map((file) => readFileSync(new URL(`../apps/web/src/app/${file}`, import.meta.url), 'utf8'))
    .join('\n');
  const loaded = [...source.matchAll(/src: '\.\.\/fonts\/([^']+)',\s*weight: '(\d+) (\d+)'/g)].map((m) => ({
    file: m[1],
    weights: [Number(m[2]), Number(m[3])],
  }));

  it('loads exactly the typeface files over the weight range the tokens use', () => {
    const declared = Object.values(typefaces).map((face) => ({
      file: face.file,
      weights: [Math.min(...face.weights), Math.max(...face.weights)],
    }));
    expect(loaded).toEqual(declared);
  });

  it('gives each face a generic fallback, so Android never lands on an unadjusted browser default', () => {
    const fallbacks = [...source.matchAll(/localFont\(\{[^}]*?fallback: \[([^\]]*)\]/g)].map((m) => m[1]);
    expect(fallbacks).toEqual(["'sans-serif'", "'sans-serif'"]);
  });
});
