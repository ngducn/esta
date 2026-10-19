'use client';

import { Camera, Plus } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button-variants';
import { useHydrated } from '@/lib/use-hydrated';
import { useOpenExpense, warmExpenseSheet } from './expense-host';

/**
 * `Thêm chi phí` and `Chụp hoá đơn`. The photo action is a camera input itself, because a phone opens the camera only
 * from a tap on the input; the sheet opens once a photo is taken. `primary` makes `Thêm chi phí` the screen's one accent,
 * on the Thu chi tab; elsewhere both stay outline so each tab keeps its own primary action. Both wait for hydration:
 * a photo taken before React owns the input would come back to no change handler and be lost.
 */
export function ExpenseActions({ labels, primary = false }: { labels: { add: string; photo: string }; primary?: boolean }) {
  const open = useOpenExpense();
  const hydrated = useHydrated();
  return (
    <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap" onPointerEnter={warmExpenseSheet} onFocus={warmExpenseSheet}>
      <button
        type="button"
        data-testid="add-expense"
        aria-haspopup="dialog"
        onPointerDown={warmExpenseSheet}
        disabled={!hydrated}
        onClick={() => open({ kind: 'new', receipt: null })}
        className={buttonVariants({ variant: primary ? 'primary' : 'outline' })}
      >
        <Plus aria-hidden="true" />
        {labels.add}
      </button>
      <label
        className={buttonVariants({
          variant: 'outline',
          className: 'relative cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus',
        })}
        onPointerDown={warmExpenseSheet}
      >
        <Camera aria-hidden="true" />
        {labels.photo}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          data-testid="receipt-camera"
          disabled={!hydrated}
          className="absolute inset-0 cursor-pointer opacity-0"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file !== undefined) open({ kind: 'new', receipt: file });
          }}
        />
      </label>
    </div>
  );
}
