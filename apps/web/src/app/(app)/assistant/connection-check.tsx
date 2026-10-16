'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

const REFRESH_MS = 2_000;

export function RefreshWhilePending({ pending }: { pending: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => router.refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [pending, router]);
  return null;
}
