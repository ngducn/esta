import { StatusShape } from '@/components/status-mark';
import { buttonVariants } from '@/components/ui/button-variants';
import { SheetClose } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

type SheetFooterProps = {
  /** The one error line above the buttons, for a refusal that belongs to no field. */
  readonly error: string | null;
  readonly labels: { readonly cancel: string; readonly save: string; readonly saving: string };
  readonly pending: boolean;
  readonly onSave: () => void;
  /** Prefixes `-error` and `-save`, the hooks the e2e specs press and read. */
  readonly testId: string;
};

/**
 * The bottom row of a form sheet: the error line, `Huỷ` and the primary save, kept above the phone's home bar. Issue
 * #193 grows it into the one form-sheet shell.
 */
export function SheetFooter({ error, labels, pending, onSave, testId }: SheetFooterProps) {
  return (
    <div className="sticky bottom-0 mt-auto flex flex-col gap-3 border-t border-rule bg-surface px-5 pt-4 pb-[max(--spacing(5),env(safe-area-inset-bottom))] sm:px-6">
      {error === null ? null : (
        <p role="alert" data-testid={`${testId}-error`} className="flex items-start gap-2 text-body text-overdue">
          <StatusShape status="overdue" className="mt-1 size-4" />
          <span className="min-w-0 wrap-anywhere">{error}</span>
        </p>
      )}
      <div className="flex gap-2">
        <SheetClose disabled={pending} className={cn(buttonVariants({ variant: 'outline' }), 'flex-1')}>
          {labels.cancel}
        </SheetClose>
        <button type="button" data-testid={`${testId}-save`} onClick={onSave} disabled={pending} className={cn(buttonVariants({ variant: 'primary' }), 'flex-[2]')}>
          {pending ? labels.saving : labels.save}
        </button>
      </div>
    </div>
  );
}
