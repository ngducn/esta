import { describe, expect, it } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
  it('keeps a token font size beside a token color', () => {
    expect(cn('text-small text-ink')).toBe('text-small text-ink');
    expect(cn('text-hero-xl', 'text-overdue')).toBe('text-hero-xl text-overdue');
  });

  it('lets a later token font size or color win', () => {
    expect(cn('text-small text-ink', 'text-body')).toBe('text-ink text-body');
    expect(cn('text-ink', 'text-surface')).toBe('text-surface');
  });

  it('merges the touch spacing token with other sizes', () => {
    expect(cn('min-h-touch', 'min-h-8')).toBe('min-h-8');
  });
});
