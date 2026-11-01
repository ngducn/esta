'use client';

import { Dialog as SheetPrimitive } from '@base-ui/react/dialog';
import { cn } from '@/lib/utils';

const Sheet = SheetPrimitive.Root;
const SheetClose = SheetPrimitive.Close;

/** The design system's `es-sheet` on a phone, sliding up over the scrim, and its `es-modal` from 600 px. */
function SheetContent({ className, children, ...props }: SheetPrimitive.Popup.Props) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Backdrop
        data-slot="sheet-backdrop"
        className="fixed inset-0 z-50 min-h-dvh bg-scrim transition-opacity duration-(--duration-base) ease-standard data-ending-style:opacity-0 data-starting-style:opacity-0"
      />
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col gap-6 overflow-y-auto rounded-t-2xl border-t border-border bg-surface-raised p-5 pb-[max(--spacing(5),env(safe-area-inset-bottom))] text-text shadow-lg',
          'transition-[translate,scale,opacity] duration-(--duration-sheet) ease-enter data-ending-style:translate-y-full data-ending-style:duration-(--duration-base) data-ending-style:ease-exit data-starting-style:translate-y-full',
          'sm:inset-auto sm:top-1/2 sm:left-1/2 sm:max-h-[calc(100dvh-3rem)] sm:w-dialog sm:max-w-[calc(100vw-3rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:border sm:p-6 sm:duration-(--duration-slow)',
          'sm:data-ending-style:-translate-y-1/2 sm:data-ending-style:scale-98 sm:data-ending-style:opacity-0 sm:data-starting-style:-translate-y-1/2 sm:data-starting-style:scale-98 sm:data-starting-style:opacity-0',
          className,
        )}
        {...props}
      >
        {children}
      </SheetPrimitive.Popup>
    </SheetPrimitive.Portal>
  );
}

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return <SheetPrimitive.Title className={cn('text-title-3 text-text', className)} {...props} />;
}

function SheetDescription({ className, ...props }: SheetPrimitive.Description.Props) {
  return <SheetPrimitive.Description className={cn('text-body text-text-secondary', className)} {...props} />;
}

export { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle };
