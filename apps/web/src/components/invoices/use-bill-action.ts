'use client';

import type { Result } from '@esta/core/result';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

/**
 * The bill page's writes: run the action, keep its refusal for the line under the button, and on success hand back to
 * the page, which the refresh redraws. A thrown call reads as `failed`. Issue #193's `useAction` replaces it.
 */
export function useBillAction<R extends string>(onDone: () => void = () => {}) {
  const router = useRouter();
  const [refusal, setRefusal] = useState<R | 'failed' | null>(null);
  const [pending, start] = useTransition();
  const run = (call: () => Promise<Result<undefined, R | 'failed'>>) =>
    start(async () => {
      const result = await call().catch(() => ({ ok: false, reason: 'failed' }) as const);
      setRefusal(result.ok ? null : result.reason);
      if (!result.ok) return;
      onDone();
      router.refresh();
    });
  return { refusal, setRefusal, pending, run };
}
