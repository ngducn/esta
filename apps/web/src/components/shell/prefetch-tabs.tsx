'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { primarySections } from './nav';

/** A streamed section can paint its largest content after the load event, so the prefetch waits past it too. */
const AFTER_LOAD_MS = 3_000;

/**
 * Prefetches the other tabs once the first screen has loaded and the page is idle, so they never share the network
 * with the first screen, yet a first tap finds its section's loading state cached and paints at once.
 */
export function PrefetchTabs() {
  const router = useRouter();
  useEffect(() => {
    const prefetch = () => {
      for (const { href } of primarySections) if (href !== window.location.pathname) router.prefetch(href);
    };
    let cancel = () => {};
    const whenIdle = () => {
      if (typeof window.requestIdleCallback === 'function') {
        const id = window.requestIdleCallback(prefetch);
        cancel = () => window.cancelIdleCallback(id);
      } else prefetch();
    };
    const afterLoad = () => {
      const id = window.setTimeout(whenIdle, AFTER_LOAD_MS);
      cancel = () => window.clearTimeout(id);
    };
    if (document.readyState === 'complete') afterLoad();
    else {
      window.addEventListener('load', afterLoad, { once: true });
      cancel = () => window.removeEventListener('load', afterLoad);
    }
    return () => cancel();
  }, [router]);
  return null;
}
