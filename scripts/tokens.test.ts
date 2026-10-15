import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { leading, minimumLeading, typeScale, typefaces } from '../apps/web/src/design/tokens.ts';

describe('leading', () => {
  it(`keeps every line height at ${minimumLeading} or more`, () => {
    expect(Object.entries(leading).filter(([, value]) => value < minimumLeading)).toEqual([]);
  });

  it('gives every type scale step a leading from the scale', () => {
    const allowed: readonly number[] = Object.values(leading);
    expect(Object.entries(typeScale).filter(([, step]) => !allowed.includes(step.leading))).toEqual([]);
  });
});

describe('fonts.ts', () => {
  // next/font only accepts literal options, so fonts.ts restates what `typefaces` declares.
  const source = readFileSync(new URL('../apps/web/src/app/fonts.ts', import.meta.url), 'utf8');
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
    expect(fallbacks).toEqual(["'sans-serif'", "'serif'"]);
  });
});
