'use client';

import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { Toaster, useToastManager } from '@/components/ui/toast';

export const UNDO_MS = 6000;

/** Mount once around the screen; `useUndoToast` shows the toast inside it. */
export const UndoToastProvider = Toaster;

/** Returns `show(message, onUndo)`: the message names what happened, and `Hoàn tác` reverses it for 6 s. */
export function useUndoToast(): (message: string, onUndo: () => void) => void {
  const t = useTranslations('components.toast');
  const manager = useToastManager();
  return useCallback(
    (message, onUndo) => {
      const id = manager.add({
        title: message,
        timeout: UNDO_MS,
        actionProps: {
          children: t('undo'),
          onClick: () => {
            onUndo();
            manager.close(id);
          },
        },
      });
    },
    [manager, t],
  );
}
