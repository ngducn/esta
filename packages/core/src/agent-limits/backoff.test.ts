import { describe, expect, it } from 'vitest';
import { parseInstant } from '../clock/resolve';
import { retryAt } from './backoff';

const failedAt = parseInstant('2026-10-07T09:00:00+07:00');

describe('retryAt', () => {
  it.each([
    { attempt: 1, next: '2026-10-07T02:01:00.000Z' },
    { attempt: 2, next: '2026-10-07T02:05:00.000Z' },
    { attempt: 3, next: '2026-10-07T02:25:00.000Z' },
  ])('runs attempt $attempt + 1 at $next', ({ attempt, next }) => {
    expect(retryAt(attempt, 4, failedAt)).toBe(next);
  });

  it('gives up after the last attempt', () => {
    expect(retryAt(4, 4, failedAt)).toBeNull();
    expect(retryAt(1, 1, failedAt)).toBeNull();
  });

  it('keeps 25 minutes for a job allowed more than four attempts', () => {
    expect(retryAt(7, 10, failedAt)).toBe('2026-10-07T02:25:00.000Z');
  });
});
