'use client';

import { useEffect, useState } from 'react';

/** How long typing must pause before a half-typed value such as `3t` may show as an error. */
export const SETTLE_MS = 700;

/** True once `text` has stayed unchanged for SETTLE_MS, or right away after `settle()` (on blur). */
export function useSettled(text: string): { settled: boolean; settle: () => void } {
  const [settledText, setSettledText] = useState(text);
  useEffect(() => {
    const timer = setTimeout(() => setSettledText(text), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [text]);
  return { settled: settledText === text, settle: () => setSettledText(text) };
}
