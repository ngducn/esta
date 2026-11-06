'use client';

import type { Result } from '@esta/core/result';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAction } from '@/components/use-action';

/** One save of the preview (post, link or undo): its pending state, what it said and why it failed, and a refresh on success. */
export function useStatementSave(onSaved: () => void) {
  const t = useTranslations('statements');
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const { pending, run } = useAction();
  const save = <T,>(call: () => Promise<Result<T, 'failed'>>, said: (done: T) => string) => {
    setError(null);
    setResult(null);
    run(call, (outcome) => {
      if (!outcome.ok) {
        setError(t('errorFailed'));
        return;
      }
      setResult(said(outcome.value));
      onSaved();
      router.refresh();
    });
  };
  return { saving: pending, error, result, save };
}
