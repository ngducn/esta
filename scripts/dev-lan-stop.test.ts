import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stopWhenOrphaned } from './dev-lan-stop.ts';

function fakeProcess(ppid: number): EventEmitter & { ppid: number } {
  return Object.assign(new EventEmitter(), { ppid });
}

describe('stopWhenOrphaned', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(['SIGINT', 'SIGTERM', 'SIGHUP'] as const)('stops on %s', (signal) => {
    const proc = fakeProcess(500);
    const stop = vi.fn();
    stopWhenOrphaned(proc, stop, 1_000);

    proc.emit(signal);

    expect(stop).toHaveBeenCalledOnce();
  });

  it('stops once the parent dies and the process is reparented', () => {
    const proc = fakeProcess(500);
    const stop = vi.fn();
    stopWhenOrphaned(proc, stop, 1_000);

    vi.advanceTimersByTime(3_000);
    expect(stop).not.toHaveBeenCalled();

    proc.ppid = 1;
    vi.advanceTimersByTime(1_000);
    expect(stop).toHaveBeenCalled();
  });
});
