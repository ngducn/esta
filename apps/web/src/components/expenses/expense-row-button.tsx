'use client';

import type { ReactNode } from 'react';
import type { ExpenseRow } from '@/server/expenses/load';
import { useOpenExpense, warmExpenseSheet } from './expense-host';

/** A row of the Thu chi list opens its expense in the sheet, to edit or delete it. */
export function ExpenseRowButton({ expense, label, children }: { expense: ExpenseRow; label: string; children: ReactNode }) {
  const open = useOpenExpense();
  return (
    <button
      type="button"
      aria-label={label}
      aria-haspopup="dialog"
      data-testid="expense-row-edit"
      onPointerDown={warmExpenseSheet}
      onClick={() => open({ kind: 'edit', expense })}
      className="-mx-2 flex min-h-touch min-w-0 flex-1 items-start gap-3 rounded-sm px-2 py-3 text-left outline-none hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {children}
    </button>
  );
}
