'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';

export type CoverPhotoPriority = 'high' | 'eager' | 'lazy';

const REFRESH_GAP_MS = 30_000;
let lastRefresh = Number.NEGATIVE_INFINITY;

/**
 * A plain img on a signed URL. A signed URL expires, so the first failure re-renders the page for fresh URLs; a photo
 * that still fails, or a property with none, shows the fallback tile instead of a broken image.
 */
export function CoverPhoto({ src, alt, priority, fallback }: { src: string | null; alt: string; priority: CoverPhotoPriority; fallback: ReactNode }) {
  const router = useRouter();
  const image = useRef<HTMLImageElement>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    const element = image.current;
    if (element === null || src === null) return;
    const fail = () => {
      const now = performance.now();
      if (now - lastRefresh > REFRESH_GAP_MS) {
        lastRefresh = now;
        router.refresh();
      } else {
        setFailed(src);
      }
    };
    if (element.complete && element.naturalWidth === 0) fail();
    element.addEventListener('error', fail);
    return () => element.removeEventListener('error', fail);
  }, [router, src]);

  if (src === null || failed === src) return fallback;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a signed storage URL changes every render, so the optimizer could never cache it
    <img
      ref={image}
      src={src}
      alt={alt}
      decoding="async"
      fetchPriority={priority === 'high' ? 'high' : 'auto'}
      loading={priority === 'lazy' ? 'lazy' : 'eager'}
      className="absolute inset-0 size-full object-cover"
    />
  );
}
