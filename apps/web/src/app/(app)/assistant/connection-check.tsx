'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

const REFRESH_MS = 2_000;

/** Re-renders the server page every 2 s while the newest ping is queued or running, and stops once it settles. */
export function RefreshWhilePending({ pending }: { pending: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => router.refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [pending, router]);
  return null;
}
