import { describe, expect, it } from 'vitest';
import { parseInstant } from '../clock/resolve';
import { heartbeatReadBound, workerStatus } from './worker-status';

const at = parseInstant;
const now = at('2026-10-07T09:05:00+07:00');
const beat = (lastSeenAt: string, usageLimited = false) => ({ lastSeenAt: at(lastSeenAt), usageLimited });

describe('workerStatus', () => {
  it('is never with no heartbeat row', () => {
    expect(workerStatus(null, now)).toEqual({ kind: 'never' });
  });

  it('is paused while a beating worker reports a usage limit', () => {
    expect(workerStatus(beat('2026-10-07T09:04:00+07:00', true), now)).toEqual({ kind: 'paused', time: '09:04', earlierDate: null });
  });

  it('is offline, not paused, once a paused worker stops beating', () => {
    expect(workerStatus(beat('2026-10-07T08:59:00+07:00', true), now)).toMatchObject({ kind: 'offline' });
  });

  it('is online at exactly 5 minutes', () => {
    expect(workerStatus(beat('2026-10-07T09:00:00+07:00'), now)).toEqual({ kind: 'online', time: '09:00', earlierDate: null });
  });

  it('is offline at 5 minutes and 1 second', () => {
    expect(workerStatus(beat('2026-10-07T08:59:59+07:00'), now)).toEqual({ kind: 'offline', time: '08:59', earlierDate: null });
  });

  it('names the business date of a heartbeat on an earlier day', () => {
    expect(workerStatus(beat('2026-10-06T21:30:00+07:00'), now)).toEqual({ kind: 'offline', time: '21:30', earlierDate: '2026-10-06' });
  });

  it('reads the date in Asia/Ho_Chi_Minh, where 23:30 UTC is already the next day', () => {
    expect(workerStatus(beat('2026-10-06T23:30:00Z'), at('2026-10-07T00:10:00Z'))).toEqual({
      kind: 'offline',
      time: '06:30',
      earlierDate: null,
    });
  });

  it('keeps the earlier date across midnight while still online', () => {
    expect(workerStatus(beat('2026-10-06T23:58:00+07:00'), at('2026-10-07T00:01:00+07:00'))).toEqual({
      kind: 'online',
      time: '23:58',
      earlierDate: '2026-10-06',
    });
  });
});

describe('heartbeatReadBound', () => {
  it('reads a heartbeat from a worker host up to 10 seconds ahead, and no further', () => {
    expect(heartbeatReadBound(now)).toBe('2026-10-07T02:05:10.000Z');
  });

  it('reads a heartbeat 10 seconds ahead as online at its own time', () => {
    expect(workerStatus(beat('2026-10-07T09:05:10+07:00'), now)).toEqual({ kind: 'online', time: '09:05', earlierDate: null });
  });
});
