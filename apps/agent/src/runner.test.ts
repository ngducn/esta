import { parseInstant } from '@esta/core';
import { describe, expect, it } from 'vitest';
import { nextAttempt } from './runner';

const asOf = parseInstant('2026-10-07T09:00:00+07:00');
const error = { kind: 'error', message: 'Overloaded' } as const;

describe('nextAttempt', () => {
  it.each([
    { attempts: 1, runAfter: '2026-10-07T02:01:00.000Z' },
    { attempts: 2, runAfter: '2026-10-07T02:05:00.000Z' },
    { attempts: 3, runAfter: '2026-10-07T02:25:00.000Z' },
  ])('requeues after attempt $attempts at $runAfter', ({ attempts, runAfter }) => {
    expect(nextAttempt({ attempts, max_attempts: 4 }, error, asOf)).toEqual({ status: 'queued', runAfter });
  });

  it('fails the job after the fourth attempt', () => {
    expect(nextAttempt({ attempts: 4, max_attempts: 4 }, error, asOf)).toEqual({ status: 'failed' });
  });

  it.each(['missing_recording', 'auth_error'] as const)('fails a %s at once, because a retry cannot fix it', (kind) => {
    expect(nextAttempt({ attempts: 1, max_attempts: 4 }, { kind, message: 'x' }, asOf)).toEqual({ status: 'failed' });
  });
});
