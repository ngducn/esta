import { LoaderCircle, RotateCw } from 'lucide-react';
import { StatusShape } from '@/components/status-shape';
import { buttonVariants } from '@/components/ui/button-variants';
import { SheetClose } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

type SheetFooterProps = {
  readonly error: string | null;
  readonly labels: { readonly cancel: string; readonly save: string; readonly saving: string; readonly retry?: string };
  readonly pending: boolean;
  readonly onSave: () => void;
  readonly testId: string;
  /** The save failed and nothing typed was lost, so the button offers the same save again as `labels.retry`. */
  readonly failed?: boolean;
  /**
   * The sheet's head has its own `Đóng`, so a phone shows one full-width save button and nothing beside it, and the
   * desktop modal puts `Hủy` and the save button at the right.
   */
  readonly closeInHead?: boolean;
};

export function SheetFooter({ error, labels, pending, onSave, testId, failed = false, closeInHead = false }: SheetFooterProps) {
  const retry = failed && labels.retry !== undefined ? labels.retry : null;
  return (
    <div className="sticky bottom-0 mt-auto flex flex-col gap-3 border-t border-border bg-surface px-5 pt-4 pb-[max(--spacing(5),env(safe-area-inset-bottom))] sm:px-6">
      {error === null ? null : (
        <p role="alert" data-testid={`${testId}-error`} className="flex items-start gap-2 text-body text-danger-text">
          <StatusShape status="overdue" className="mt-1 size-4" />
          <span className="min-w-0 wrap-anywhere">{error}</span>
        </p>
      )}
      <div className={cn('flex gap-2', closeInHead && 'sm:justify-end')}>
        <SheetClose disabled={pending} className={cn(buttonVariants({ variant: 'secondary' }), closeInHead ? 'max-sm:hidden' : 'flex-1')}>
          {labels.cancel}
        </SheetClose>
        <button
          type="button"
          data-testid={`${testId}-save`}
          onClick={onSave}
          disabled={pending}
          aria-busy={pending}
          className={cn(buttonVariants({ variant: 'primary' }), closeInHead ? 'max-sm:min-h-control-lg max-sm:flex-1 max-sm:text-body max-sm:font-medium sm:min-w-40' : 'flex-[2]')}
        >
          {pending ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : retry === null ? null : <RotateCw aria-hidden="true" />}
          {pending ? labels.saving : (retry ?? labels.save)}
        </button>
      </div>
    </div>
  );
}
