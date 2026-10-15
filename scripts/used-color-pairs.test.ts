import { describe, expect, it } from 'vitest';
import { findUnlistedPairs, usedColorPairs } from './used-color-pairs.ts';

describe('usedColorPairs', () => {
  it('reads text on its own background, and text with no background on both grounds', () => {
    expect(usedColorPairs(`<div className="bg-ink text-paper" /><p className='text-ink-muted'>`)).toEqual([
      { kind: 'text', foreground: 'paper', background: 'ink' },
      { kind: 'text', foreground: 'ink-muted', background: 'paper' },
      { kind: 'text', foreground: 'ink-muted', background: 'surface' },
    ]);
  });

  it('pairs each variant with its own background, falling back to the base one', () => {
    expect(usedColorPairs(`'bg-surface text-paper group-data-checked/box:bg-ink hover:bg-ink/88'`)).toEqual([
      { kind: 'text', foreground: 'paper', background: 'surface' },
      { kind: 'text', foreground: 'paper', background: 'ink' },
      { kind: 'text', foreground: 'paper', background: 'ink' },
    ]);
  });

  it('reads a status color as a shape and skips disabled states, which WCAG exempts', () => {
    expect(usedColorPairs(`'text-due disabled:bg-rule disabled:text-ink-muted'`)).toEqual([
      { kind: 'shape', foreground: 'due', background: 'paper' },
      { kind: 'shape', foreground: 'due', background: 'surface' },
    ]);
  });
});

describe('findUnlistedPairs', () => {
  it('names a pair the UI draws that text-pairs.ts does not list', () => {
    expect(findUnlistedPairs([{ path: 'x.tsx', source: `'bg-surface text-paper'` }])).toEqual(['x.tsx: paper text on surface']);
  });

  it('finds every pair the web app draws in text-pairs.ts', () => {
    expect(findUnlistedPairs()).toEqual([]);
  });
});
