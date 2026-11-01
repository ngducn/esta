'use client';

import { AlertDialog as AlertDialogPrimitive } from '@base-ui/react/alert-dialog';
import { cn } from '@/lib/utils';

const AlertDialog = AlertDialogPrimitive.Root;
const AlertDialogClose = AlertDialogPrimitive.Close;

function AlertDialogContent({ className, children, ...props }: AlertDialogPrimitive.Popup.Props) {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Backdrop
        data-slot="dialog-backdrop"
        className="fixed inset-0 min-h-dvh bg-scrim transition-opacity duration-(--duration-base) ease-standard data-ending-style:opacity-0 data-starting-style:opacity-0"
      />
      <AlertDialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          'fixed top-1/2 left-1/2 flex w-dialog max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-6 rounded-xl border border-border bg-surface-raised p-6 text-text shadow-lg',
          'transition-[scale,opacity] duration-(--duration-slow) ease-enter data-ending-style:scale-98 data-ending-style:opacity-0 data-ending-style:duration-(--duration-base) data-ending-style:ease-exit data-starting-style:scale-98 data-starting-style:opacity-0',
          className,
        )}
        {...props}
      >
        {children}
      </AlertDialogPrimitive.Popup>
    </AlertDialogPrimitive.Portal>
  );
}

function AlertDialogTitle({ className, ...props }: AlertDialogPrimitive.Title.Props) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('text-title-3 text-balance text-text', className)}
      {...props}
    />
  );
}

function AlertDialogDescription({ className, ...props }: AlertDialogPrimitive.Description.Props) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="dialog-description"
      className={cn('text-body text-text-secondary', className)}
      {...props}
    />
  );
}

export { AlertDialog, AlertDialogClose, AlertDialogContent, AlertDialogDescription, AlertDialogTitle };
