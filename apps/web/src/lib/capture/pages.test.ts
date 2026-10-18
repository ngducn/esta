// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { capturePagesReducer, MAX_CAPTURE_PAGES, useCapturePages, type CapturedPage } from './pages';

const page = (n: number): CapturedPage => ({ blob: new Blob([String(n)]), url: `blob:page-${n}`, width: 100 + n, height: 200 });
const urls = (pages: readonly CapturedPage[]) => pages.map((each) => each.url);
const three = [page(1), page(2), page(3)];

describe('capturePagesReducer', () => {
  it('adds pages in order and moves a page up or down by one place', () => {
    const added = capturePagesReducer([], { type: 'add', pages: three });
    expect(urls(added)).toEqual(['blob:page-1', 'blob:page-2', 'blob:page-3']);
    expect(urls(capturePagesReducer(added, { type: 'moveUp', url: 'blob:page-3' }))).toEqual(['blob:page-1', 'blob:page-3', 'blob:page-2']);
    expect(urls(capturePagesReducer(added, { type: 'moveDown', url: 'blob:page-1' }))).toEqual(['blob:page-2', 'blob:page-1', 'blob:page-3']);
  });

  it('leaves the strip unchanged for moveUp on the first page and moveDown on the last', () => {
    expect(capturePagesReducer(three, { type: 'moveUp', url: 'blob:page-1' })).toBe(three);
    expect(capturePagesReducer(three, { type: 'moveDown', url: 'blob:page-3' })).toBe(three);
  });

  it('removes one page and keeps the rest in order', () => {
    expect(urls(capturePagesReducer(three, { type: 'remove', url: 'blob:page-2' }))).toEqual(['blob:page-1', 'blob:page-3']);
  });

  it('keeps at most 20 pages, the first ones chosen', () => {
    const many = Array.from({ length: 21 }, (_, n) => page(n + 1));
    const capped = capturePagesReducer([], { type: 'add', pages: many });
    expect(capped).toHaveLength(MAX_CAPTURE_PAGES);
    expect(capped.at(-1)?.url).toBe('blob:page-20');
    expect(capturePagesReducer(capped, { type: 'add', pages: [page(22)] })).toHaveLength(MAX_CAPTURE_PAGES);
  });
});

describe('useCapturePages', () => {
  let created = 0;
  const revoke = vi.fn<(url: string) => void>();

  beforeEach(() => {
    created = 0;
    revoke.mockReset();
    URL.createObjectURL = () => `blob:made-${++created}`;
    URL.revokeObjectURL = revoke;
  });

  afterEach(() => vi.restoreAllMocks());

  const image = () => ({ blob: new Blob(['x']), width: 10, height: 20 });

  it('revokes the URL of a removed page and of a page past the cap, and every URL on unmount', () => {
    const { result, unmount } = renderHook(() => useCapturePages());
    act(() => result.current.add([image(), image()]));
    expect(urls(result.current.pages)).toEqual(['blob:made-1', 'blob:made-2']);

    act(() => result.current.dispatch({ type: 'remove', url: 'blob:made-1' }));
    expect(revoke.mock.calls).toEqual([['blob:made-1']]);

    act(() => result.current.add(Array.from({ length: 20 }, image)));
    expect(result.current.pages).toHaveLength(MAX_CAPTURE_PAGES);
    expect(revoke.mock.calls.slice(1), 'the one page past the cap').toEqual([['blob:made-22']]);

    revoke.mockReset();
    unmount();
    expect(revoke.mock.calls.map(([url]) => url).toSorted()).toEqual(urls(result.current.pages).toSorted());
  });
});
