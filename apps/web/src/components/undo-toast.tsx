'use client';

import { useTranslations } from 'next-intl';
import { createContext, lazy, Suspense, useCallback, useContext, useState, type ReactNode } from 'react';
import type { ToastRequest } from '@/components/ui/toast';

export const UNDO_MS = 6000;

type ShowUndo = (message: string, onUndo: () => void) => void;

const Toaster = lazy(() => import('@/components/ui/toast'));
const ShowUndoContext = createContext<ShowUndo | null>(null);

/** Mount once around the screen; `useUndoToast` shows the toast inside it. */
export function UndoToastProvider({ children }: { children: ReactNode }) {
  const t = useTranslations('components.toast');
  const [request, setRequest] = useState<ToastRequest | null>(null);
  const show = useCallback<ShowUndo>(
    (message, onUndo) => setRequest({ message, timeout: UNDO_MS, action: { label: t('undo'), onClick: onUndo } }),
    [t],
  );
  return (
    <ShowUndoContext value={show}>
      {children}
      {/* The live region is in the first paint so screen readers already watch it when the lazy toast lands inside. */}
      <div
        role="region"
        aria-live="polite"
        aria-label={t('region')}
        className="fixed inset-x-4 bottom-4 mx-auto max-w-lg"
      >
        {request === null ? null : (
          <Suspense fallback={null}>
            <Toaster request={request} />
          </Suspense>
        )}
      </div>
    </ShowUndoContext>
  );
}

/** Returns `show(message, onUndo)`: the message names what happened, and `Hoàn tác` reverses it for 6 s. */
export function useUndoToast(): ShowUndo {
  const show = useContext(ShowUndoContext);
  if (show === null) throw new Error('useUndoToast needs an UndoToastProvider above it');
  return show;
}
