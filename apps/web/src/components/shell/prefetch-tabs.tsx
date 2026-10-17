'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { primarySections } from './nav';

/**
 * Waits for the load event and then an idle moment, so the tab prefetches never share the network with the first screen,
 * yet a first tap finds its section's loading state already cached and paints at once.
 */
export function PrefetchTabs() {
  const router = useRouter();
  useEffect(() => {
    const prefetch = () => {
      for (const { href } of primarySections) router.prefetch(href);
    };
    let cancel = () => {};
    const whenIdle = () => {
      if (typeof window.requestIdleCallback === 'function') {
        const id = window.requestIdleCallback(prefetch);
        cancel = () => window.cancelIdleCallback(id);
      } else {
        const id = window.setTimeout(prefetch, 0);
        cancel = () => window.clearTimeout(id);
      }
    };
    if (document.readyState === 'complete') whenIdle();
    else {
      window.addEventListener('load', whenIdle, { once: true });
      cancel = () => window.removeEventListener('load', whenIdle);
    }
    return () => cancel();
  }, [router]);
  return null;
}
