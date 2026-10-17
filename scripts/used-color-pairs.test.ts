import { describe, expect, it } from 'vitest';
import { findUnlistedPairs, usedColorPairs } from './used-color-pairs.ts';

describe('usedColorPairs', () => {
  it('reads text on its own background, and text with no background on every ground', () => {
    expect(usedColorPairs(`<div className="bg-ink text-surface" /><p className='text-ink-muted'>`)).toEqual([
      { kind: 'text', foreground: 'surface', background: 'ink' },
      { kind: 'text', foreground: 'ink-muted', background: 'ground' },
      { kind: 'text', foreground: 'ink-muted', background: 'surface' },
      { kind: 'text', foreground: 'ink-muted', background: 'surface-2' },
    ]);
  });

  it('pairs each variant with its own background, falling back to the base one', () => {
    expect(usedColorPairs(`'bg-surface text-ground group-data-checked/box:bg-ink hover:bg-ink/88'`)).toEqual([
      { kind: 'text', foreground: 'ground', background: 'surface' },
      { kind: 'text', foreground: 'ground', background: 'ink' },
      { kind: 'text', foreground: 'ground', background: 'ink', opacity: 88 },
    ]);
  });

  it('keeps the opacity of a translucent background, which lets the ground show through', () => {
    expect(usedColorPairs(`'bg-accent text-on-accent hover:bg-accent/90'`)).toEqual([
      { kind: 'text', foreground: 'on-accent', background: 'accent' },
      { kind: 'text', foreground: 'on-accent', background: 'accent', opacity: 90 },
    ]);
  });

  it('skips a backdrop, which carries no text', () => {
    expect(usedColorPairs(`'bg-surface text-ink backdrop:bg-ground/85'`)).toEqual([{ kind: 'text', foreground: 'ink', background: 'surface' }]);
  });

  it('holds a status word to the text minimum and skips disabled states, which WCAG exempts', () => {
    expect(usedColorPairs(`'text-due bg-due-fill disabled:bg-rule disabled:text-ink-muted'`)).toEqual([
      { kind: 'text', foreground: 'due', background: 'due-fill' },
    ]);
  });
});

describe('findUnlistedPairs', () => {
  it('names a pair the UI draws that text-pairs.ts does not list', () => {
    expect(findUnlistedPairs([{ path: 'x.tsx', source: `'bg-surface text-ground'` }])).toEqual(['x.tsx: ground text on surface']);
  });

  it('names a translucent pair that text-pairs.ts does not list', () => {
    expect(findUnlistedPairs([{ path: 'x.tsx', source: `'bg-accent text-on-accent hover:bg-accent/70'` }])).toEqual([
      'x.tsx: on-accent text on accent/70',
    ]);
  });

  it('finds every pair the web app draws in text-pairs.ts', () => {
    expect(findUnlistedPairs()).toEqual([]);
  });
});
