'use client';

import type { IsoDate } from '@esta/core/date';
import type { AbstractIntlMessages, Locale } from 'next-intl';
import { createContext, lazy, Suspense, useCallback, useContext, useState, type ReactNode } from 'react';
import type { ExpenseRow, ExpenseVendorOption } from '@/server/expenses/load';

export type ExpenseScope = {
  readonly propertyId: string;
  readonly nickname: string;
  readonly today: IsoDate;
  readonly vendors: readonly ExpenseVendorOption[];
  readonly locale: Locale;
  readonly messages: AbstractIntlMessages;
};

/** `new` with a file comes from `Chụp hoá đơn`, which opens the camera before the sheet. */
export type ExpenseRequest = { readonly kind: 'new'; readonly receipt: File | null } | { readonly kind: 'edit'; readonly expense: ExpenseRow };

const loadIsland = () => import('./expense-island');
const ExpenseIsland = lazy(loadIsland);

/** Fetches the sheet's code when a hand or the keyboard reaches an expense action, before the tap lands. */
export function warmExpenseSheet() {
  void loadIsland();
}

const OpenExpense = createContext<((request: ExpenseRequest) => void) | null>(null);

export function useOpenExpense() {
  const open = useContext(OpenExpense);
  if (open === null) throw new Error('useOpenExpense needs an ExpenseHost above it');
  return open;
}

/**
 * Holds the one expense sheet of a property. The sheet, its intl provider and its toast load only on the first
 * request, so a route that shows the actions ships none of them up front; once loaded they stay, so the toast outlives
 * the sheet it came from. Each request mounts a fresh sheet, with its own expense id.
 */
export function ExpenseHost({ scope, children }: { scope: ExpenseScope; children: ReactNode }) {
  const [request, setRequest] = useState<{ readonly key: number; readonly value: ExpenseRequest } | null>(null);
  const [open, setOpen] = useState(false);
  const show = useCallback((value: ExpenseRequest) => {
    setRequest((current) => ({ key: (current?.key ?? 0) + 1, value }));
    setOpen(true);
  }, []);
  return (
    <OpenExpense value={show}>
      {children}
      {request === null ? null : (
        <Suspense fallback={null}>
          <ExpenseIsland scope={scope} sheetKey={request.key} request={request.value} open={open} onOpenChange={setOpen} />
        </Suspense>
      )}
    </OpenExpense>
  );
}
