import { describe, expect, it } from 'vitest';
import { consumption } from './consumption';

describe('consumption (LSE-4)', () => {
  it('is the reading less the one before it', () => {
    expect(consumption(2847, 2967)).toEqual({ ok: true, value: 120 });
  });

  it('is zero when the meter did not move', () => {
    expect(consumption(312, 312)).toEqual({ ok: true, value: 0 });
  });

  it('refuses a reading below the one before it', () => {
    expect(consumption(4120, 4119)).toEqual({ ok: false, reason: 'below_previous' });
  });
});

