import { describe, expect, it } from 'vitest';
import { findRetiredNames, findUnlistedPairs, usedColorPairs } from './used-color-pairs.ts';

describe('usedColorPairs', () => {
  it('reads text on its own background, and text with no background on every ground', () => {
    expect(usedColorPairs(`<div className="bg-surface-inverse text-text-inverse" /><p className='text-text-muted'>`)).toEqual([
      { kind: 'text', foreground: 'text-inverse', background: 'surface-inverse' },
      { kind: 'text', foreground: 'text-muted', background: 'bg' },
      { kind: 'text', foreground: 'text-muted', background: 'bg-subtle' },
      { kind: 'text', foreground: 'text-muted', background: 'surface' },
      { kind: 'text', foreground: 'text-muted', background: 'surface-raised' },
    ]);
  });

  it('pairs each variant with its own background, falling back to the base one', () => {
    expect(usedColorPairs(`'bg-surface text-text group-data-checked/box:bg-accent-subtle hover:bg-fill-hover/88'`)).toEqual([
      { kind: 'text', foreground: 'text', background: 'surface' },
      { kind: 'text', foreground: 'text', background: 'accent-subtle' },
      { kind: 'text', foreground: 'text', background: 'fill-hover', opacity: 88 },
    ]);
  });

  it('skips a backdrop, which carries no text', () => {
    expect(usedColorPairs(`'bg-surface text-text backdrop:bg-scrim'`)).toEqual([{ kind: 'text', foreground: 'text', background: 'surface' }]);
  });

  it('skips disabled states, which WCAG exempts', () => {
    expect(usedColorPairs(`'text-warning-text bg-warning-bg disabled:bg-fill-disabled disabled:text-text-disabled'`)).toEqual([
      { kind: 'text', foreground: 'warning-text', background: 'warning-bg' },
    ]);
  });
});

describe('findUnlistedPairs', () => {
  it('names a pair the UI draws that text-pairs.ts does not list', () => {
    expect(findUnlistedPairs([{ path: 'x.tsx', source: `'bg-accent text-text-muted'` }])).toEqual(['x.tsx: text-muted on accent']);
  });

  it('names a translucent pair that text-pairs.ts does not list', () => {
    expect(findUnlistedPairs([{ path: 'x.tsx', source: `'bg-accent text-on-accent hover:bg-accent/70'` }])).toEqual(['x.tsx: on-accent on accent/70']);
  });

  it('matches a listed body-text pair, whatever minimum it is listed at', () => {
    expect(findUnlistedPairs([{ path: 'x.tsx', source: `'bg-surface text-text'` }])).toEqual([]);
  });

  it('finds every pair the web app draws in text-pairs.ts', () => {
    expect(findUnlistedPairs()).toEqual([]);
  });
});

describe('findRetiredNames', () => {
  it('names a class or variable the 2026-11 redesign retired', () => {
    const source = `'text-ink hover:bg-surface-2 text-small figures md:shadow-card bg-overdue-fill/50 text-accent' style={{ color: 'var(--ink-muted)' }}`;
    expect(findRetiredNames([{ path: 'x.tsx', source }])).toEqual([
      'x.tsx: text-ink',
      'x.tsx: hover:bg-surface-2',
      'x.tsx: text-small',
      'x.tsx: figures',
      'x.tsx: md:shadow-card',
      'x.tsx: bg-overdue-fill/50',
      'x.tsx: text-accent',
      'x.tsx: var(--ink-muted)',
    ]);
  });

  it('accepts the role names, including the ones that grew out of a retired word', () => {
    const source = `'text-text border-border-field bg-surface text-accent-text bg-accent text-danger-text gap-field-gap outline-focus-ring num shadow-xs text-body-sm'`;
    expect(findRetiredNames([{ path: 'x.tsx', source }])).toEqual([]);
  });

  it('finds no retired name in the web app', () => {
    expect(findRetiredNames()).toEqual([]);
  });
});
