import { describe, expect, it } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
  it('keeps a token font size beside a token color', () => {
    expect(cn('text-body-sm text-text')).toBe('text-body-sm text-text');
    expect(cn('text-figure-xl', 'text-danger-text')).toBe('text-figure-xl text-danger-text');
  });

  it('lets a later token font size or color win', () => {
    expect(cn('text-body-sm text-text', 'text-body')).toBe('text-text text-body');
    expect(cn('text-text', 'text-text-inverse')).toBe('text-text-inverse');
  });

  it('merges the touch spacing token with other sizes', () => {
    expect(cn('min-h-touch', 'min-h-8')).toBe('min-h-8');
  });
});
