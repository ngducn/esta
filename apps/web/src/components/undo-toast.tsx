'use client';

import { createContext, lazy, Suspense, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { ToastRequest } from '@/components/ui/toast';

export const UNDO_MS = 6000;

type ShowUndo = (message: string, onUndo: () => void) => void;
type ShowNotice = (message: string) => void;

const Toaster = lazy(() => import('@/components/ui/toast'));
const ToastContext = createContext<{ undo: ShowUndo; notice: ShowNotice } | null>(null);

export type ToastLabels = { readonly region: string; readonly undo: string };

/**
 * Mount once around the screen; `useUndoToast` shows the toast inside it. The labels come translated, so a screen whose
 * server passes them needs no intl provider to hold its toast.
 */
export function ToastHost({ labels, children }: { labels: ToastLabels; children: ReactNode }) {
  const [request, setRequest] = useState<ToastRequest | null>(null);
  const undo = useCallback<ShowUndo>(
    (message, onUndo) => setRequest({ message, timeout: UNDO_MS, action: { label: labels.undo, onClick: onUndo } }),
    [labels.undo],
  );
  const notice = useCallback<ShowNotice>((message) => setRequest({ message, timeout: UNDO_MS }), []);
  const value = useMemo(() => ({ undo, notice }), [undo, notice]);
  return (
    <ToastContext value={value}>
      {children}
      {/* The live region is in the first paint so screen readers already watch it when the lazy toast lands inside. */}
      <div
        role="region"
        aria-live="polite"
        aria-label={labels.region}
        className="fixed inset-x-4 bottom-20 z-20 mx-auto max-w-lg lg:bottom-4"
      >
        {request === null ? null : (
          <Suspense fallback={null}>
            <Toaster request={request} />
          </Suspense>
        )}
      </div>
    </ToastContext>
  );
}

function useToastContext() {
  const context = useContext(ToastContext);
  if (context === null) throw new Error('useUndoToast and useNoticeToast need an UndoToastProvider above them');
  return context;
}

/** Returns `show(message, onUndo)`: the message names what happened, and `Hoàn tác` reverses it for 6 s. */
export function useUndoToast(): ShowUndo {
  return useToastContext().undo;
}

/** Returns `show(message)` for an outcome the screen may no longer be mounted to report, such as a failed `Hoàn tác`. */
export function useNoticeToast(): ShowNotice {
  return useToastContext().notice;
}
