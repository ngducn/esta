import { useCallback, useEffect, useReducer, useRef } from 'react';

/** One document holds at most this many captured pages. */
export const MAX_CAPTURE_PAGES = 20;

/** A downscaled photo in the strip. Its object URL is also its identity, since no two pages share one. */
export type CapturedPage = { readonly blob: Blob; readonly url: string; readonly width: number; readonly height: number };

export type CaptureAction =
  | { readonly type: 'add'; readonly pages: readonly CapturedPage[] }
  | { readonly type: 'moveUp'; readonly url: string }
  | { readonly type: 'moveDown'; readonly url: string }
  | { readonly type: 'remove'; readonly url: string };

function swap(pages: readonly CapturedPage[], from: number, to: number): readonly CapturedPage[] {
  if (from < 0 || to < 0 || to >= pages.length) return pages;
  const next = [...pages];
  [next[from], next[to]] = [next[to] as CapturedPage, next[from] as CapturedPage];
  return next;
}

/**
 * The strip in page order. Pages past the 20-page cap are dropped, and a move past either end changes nothing. `add`
 * always returns a new list, so the commit that drops an overflowing page also revokes its URL.
 */
export function capturePagesReducer(pages: readonly CapturedPage[], action: CaptureAction): readonly CapturedPage[] {
  const at = action.type === 'add' ? -1 : pages.findIndex((page) => page.url === action.url);
  switch (action.type) {
    case 'add':
      return [...pages, ...action.pages].slice(0, MAX_CAPTURE_PAGES);
    case 'moveUp':
      return swap(pages, at, at - 1);
    case 'moveDown':
      return swap(pages, at, at + 1);
    case 'remove':
      return pages.filter((page) => page.url !== action.url);
  }
}

/**
 * The strip, owning every object URL it hands out: a page that leaves the list, or never fits under the cap, has its
 * URL revoked after the next commit, and every one left is revoked on unmount.
 */
export function useCapturePages() {
  const [pages, dispatch] = useReducer(capturePagesReducer, []);
  const owned = useRef(new Set<string>());

  useEffect(() => {
    const kept = new Set(pages.map((page) => page.url));
    for (const url of owned.current) {
      if (kept.has(url)) continue;
      URL.revokeObjectURL(url);
      owned.current.delete(url);
    }
  }, [pages]);

  useEffect(() => {
    const urls = owned.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  const add = useCallback((images: readonly { readonly blob: Blob; readonly width: number; readonly height: number }[]) => {
    const added = images.map((image) => ({ ...image, url: URL.createObjectURL(image.blob) }));
    for (const page of added) owned.current.add(page.url);
    dispatch({ type: 'add', pages: added });
  }, []);

  return { pages, add, dispatch };
}
