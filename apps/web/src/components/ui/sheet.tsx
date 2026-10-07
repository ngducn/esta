'use client';

import { Dialog as SheetPrimitive } from '@base-ui/react/dialog';
import { cn } from '@/lib/utils';

const Sheet = SheetPrimitive.Root;
const SheetTrigger = SheetPrimitive.Trigger;
const SheetClose = SheetPrimitive.Close;

/** Slides up from the bottom on a phone and in from the right on a wide screen. */
function SheetContent({ className, children, ...props }: SheetPrimitive.Popup.Props) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Backdrop
        data-slot="sheet-backdrop"
        className="fixed inset-0 min-h-dvh bg-paper/85 transition-opacity duration-(--duration-slow) ease-standard data-ending-style:opacity-0 data-starting-style:opacity-0"
      />
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        className={cn(
          'fixed inset-x-0 bottom-0 flex max-h-[90dvh] flex-col gap-6 overflow-y-auto rounded-t-md border-t border-rule bg-surface p-6 pb-[max(--spacing(6),env(safe-area-inset-bottom))] text-ink shadow-sheet',
          'transition-[translate,opacity] duration-(--duration-slow) ease-standard data-ending-style:translate-y-8 data-ending-style:opacity-0 data-starting-style:translate-y-8 data-starting-style:opacity-0',
          'sm:inset-y-0 sm:right-0 sm:left-auto sm:max-h-none sm:w-[28rem] sm:rounded-none sm:border-t-0 sm:border-l sm:data-ending-style:translate-x-8 sm:data-ending-style:translate-y-0 sm:data-starting-style:translate-x-8 sm:data-starting-style:translate-y-0',
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
  return <SheetPrimitive.Title className={cn('font-sans text-h3 font-semibold text-ink', className)} {...props} />;
}

function SheetDescription({ className, ...props }: SheetPrimitive.Description.Props) {
  return <SheetPrimitive.Description className={cn('text-body text-ink-muted', className)} {...props} />;
}

export { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle, SheetTrigger };
