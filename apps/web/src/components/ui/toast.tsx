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
      {/* ToastHost's region announces; a second live region here would read each toast twice. */}
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
      className="w-full max-w-toast rounded-lg bg-surface-inverse text-text-inverse shadow-md transition-[translate,opacity] duration-(--duration-base) ease-enter data-ending-style:translate-y-2 data-ending-style:opacity-0 data-ending-style:ease-exit data-limited:opacity-0 data-starting-style:translate-y-2 data-starting-style:opacity-0"
    >
      <ToastPrimitive.Content className="flex items-center gap-3 py-3 pr-2 pl-4">
        <ToastPrimitive.Title className="flex-1 text-body-sm text-pretty" />
        <ToastPrimitive.Action className="-my-1.5 min-h-control-sm shrink-0 rounded-md bg-surface-inverse px-3 text-label font-semibold text-text-inverse-accent underline-offset-4 hover:underline focus-visible:-outline-offset-2 focus-visible:outline-text-inverse-accent pointer-coarse:min-h-touch" />
      </ToastPrimitive.Content>
    </ToastPrimitive.Root>
  ));
}
