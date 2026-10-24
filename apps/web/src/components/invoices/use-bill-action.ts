'use client';

import type { Result } from '@esta/core/result';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAction } from '@/components/use-action';

/**
 * The bill page's writes: run the action, keep its refusal for the line under the button, and on success hand back to
 * the page, which the refresh redraws. A thrown call reads as `failed`.
 */
export function useBillAction<R extends string>(onDone: () => void = () => {}) {
  const router = useRouter();
  const [refusal, setRefusal] = useState<R | 'failed' | null>(null);
  const { pending, run: act } = useAction();
  const run = (call: () => Promise<Result<undefined, R | 'failed'>>) =>
    act(call, (result) => {
      setRefusal(result.ok ? null : result.reason);
      if (!result.ok) return;
      onDone();
      router.refresh();
    });
  return { refusal, setRefusal, pending, run };
}
