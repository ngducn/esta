import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentStatuses } from '@/server/documents/extraction-status';

const read = vi.hoisted(() => vi.fn<(propertyId: unknown) => Promise<DocumentStatuses | null>>());
vi.mock('@/server/documents/status', () => ({ readDocumentStatuses: read }));

const { useDocumentStatuses } = await import('./use-document-status');

const reading: DocumentStatuses = { statuses: { d1: 'queued', d2: 'none' }, workerOffline: false };
const waiting: DocumentStatuses = { statuses: { d1: 'needs_review', d2: 'none' }, workerOffline: false };
const settled: DocumentStatuses = { statuses: { d2: 'none' }, workerOffline: false };

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** Fake-clock times at which the hook asked the server. */
let asks: number[] = [];

describe('useDocumentStatuses', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    read.mockReset();
    asks = [];
    read.mockImplementation(() => {
      asks.push(Date.now());
      return Promise.resolve(reading);
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('asks after 2 s at first, then every 5 s, then every 10 s, and stops after five minutes', async () => {
    const start = Date.now();
    renderHook(() => useDocumentStatuses('p1', reading));
    await advance(10 * 60_000);
    const seconds = asks.map((ms) => (ms - start) / 1_000);
    expect(seconds.slice(0, 7)).toEqual([2, 4, 6, 8, 10, 15, 20]);
    expect(seconds.at(-1)).toBe(300);
    expect(seconds.slice(-3)).toEqual([280, 290, 300]);
    expect(seconds).toHaveLength(39);
  });

  it('stops asking as soon as no document on screen is being read', async () => {
    read.mockImplementation(() => {
      asks.push(Date.now());
      return Promise.resolve(asks.length === 2 ? waiting : reading);
    });
    const { result } = renderHook(() => useDocumentStatuses('p1', reading));
    await advance(4_000);
    expect(result.current).toEqual(waiting);
    await advance(10 * 60_000);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('never asks when nothing is being read', async () => {
    renderHook(() => useDocumentStatuses('p1', settled));
    await advance(10 * 60_000);
    expect(read).not.toHaveBeenCalled();
  });

  it('starts asking again from 2 s when the page is shown after it gave up', async () => {
    renderHook(() => useDocumentStatuses('p1', reading));
    await advance(10 * 60_000);
    expect(read).toHaveBeenCalledTimes(39);
    const shown = Date.now();
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await advance(2_000);
    expect(read).toHaveBeenCalledTimes(40);
    expect(asks.at(-1)).toBe(shown + 2_000);
  });
});
