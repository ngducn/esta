'use client';

import { Toast as ToastPrimitive } from '@base-ui/react/toast';
import { useEffect } from 'react';

export type ToastRequest = { message: string; timeout: number; action?: { label: string; onClick: () => void } };

const manager = ToastPrimitive.createToastManager();

/**
 * Loaded on the first request, so a screen pays for Base UI Toast only once someone acts.
 * One toast at a time: a new request closes the previous one, so the visible undo always belongs to the latest action.
 */
export default function Toaster({ request }: { request: ToastRequest }) {
  useEffect(() => {
    const id = manager.add({
      title: request.message,
      timeout: request.timeout,
      actionProps: request.action && {
        children: request.action.label,
        onClick: () => {
          request.action?.onClick();
          manager.close(id);
        },
      },
    });
    return () => manager.close(id);
  }, [request]);
  return (
    <ToastPrimitive.Provider toastManager={manager} limit={1}>
      {/* UndoToastProvider's region announces; a second live region here would read each toast twice. */}
      <ToastPrimitive.Viewport role={undefined} aria-live={undefined} aria-label={undefined} className="outline-none">
        <ToastList />
      </ToastPrimitive.Viewport>
    </ToastPrimitive.Provider>
  );
}

function ToastList() {
  const { toasts } = ToastPrimitive.useToastManager();
  return toasts.map((toast) => (
    <ToastPrimitive.Root
      key={toast.id}
      toast={toast}
      data-slot="toast"
      className="rounded-md bg-ink text-surface shadow-sheet transition-[translate,opacity] duration-(--duration-slow) ease-standard data-ending-style:translate-y-4 data-ending-style:opacity-0 data-limited:opacity-0 data-starting-style:translate-y-4 data-starting-style:opacity-0"
    >
      <ToastPrimitive.Content className="flex items-center gap-2 py-1 pr-1 pl-4">
        <ToastPrimitive.Title className="flex-1 py-2 text-body text-pretty" />
        <ToastPrimitive.Action className="min-h-touch shrink-0 rounded-sm px-3 text-body font-semibold underline decoration-surface/60 underline-offset-4 hover:decoration-surface focus-visible:outline-surface" />
      </ToastPrimitive.Content>
    </ToastPrimitive.Root>
  ));
}
