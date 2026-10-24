'use client';

import type { Result } from '@esta/core/result';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useNoticeToast, useUndoToast } from '@/components/undo-toast';
import { useAction } from '@/components/use-action';

export type Undo<T> = {
  readonly message: string;
  /** Reverses the write from what it returned. A refusal or a throw shows `restoreFailed` in a toast, as the row may be gone. */
  readonly restore: (value: T) => Promise<{ readonly ok: boolean }>;
};

/**
 * A write on one item that refreshes the screen when it lands, shows one error line when it fails, and, given `undo`,
 * offers `Hoàn tác` in the toast.
 */
export function useUndoableAction({ failed, restoreFailed }: { readonly failed: string; readonly restoreFailed: string }) {
  const router = useRouter();
  const showUndo = useUndoToast();
  const showNotice = useNoticeToast();
  const { pending, run } = useAction();
  const [error, setError] = useState<string | null>(null);

  const perform = <T, E>(call: () => Promise<Result<T, E>>, undo?: Undo<T>) => {
    setError(null);
    run(call, (result) => {
      if (!result.ok) {
        setError(failed);
        return;
      }
      router.refresh();
      if (undo === undefined) return;
      showUndo(undo.message, () => {
        undo
          .restore(result.value)
          .then((restored) => (restored.ok ? router.refresh() : showNotice(restoreFailed)))
          .catch(() => showNotice(restoreFailed));
      });
    });
  };

  return { pending, error, perform };
}
