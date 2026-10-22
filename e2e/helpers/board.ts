import type { Page } from '@playwright/test';
import { memberRest, signedIn } from './auth-api';

/** A collections board row in one group, found by its place as the row prints it. */
export const boardRow = (page: Page, group: 'overdue' | 'due' | 'notDue' | 'paid', place: string) =>
  page.getByTestId(`group-${group}`).getByTestId('collections-row').filter({ has: page.getByTestId('row-place').getByText(place, { exact: true }) });

export type StoredInvoice = { readonly number: string; readonly memo_code: string; readonly share_token: string | null };

/** An invoice's number, memo code and share token, read as the signed-in member. */
export async function storedInvoice(page: Page, id: string): Promise<StoredInvoice> {
  const [invoice] = await memberRest<StoredInvoice[]>(page, 'GET', `invoices?id=eq.${id}&select=number,memo_code,share_token`);
  if (invoice === undefined) throw new Error(`No invoice ${id}`);
  return invoice;
}

/**
 * Undoes every payment the record payment sheet wrote in a household (the sheet's carry an idempotency key, the seed's
 * none), so a rule that records one leaves the household as seeded. A page that never signed in has nothing to undo.
 */
export async function undoSheetPayments(page: Page, householdId: string): Promise<void> {
  if (!(await signedIn(page))) return;
  const recorded = await memberRest<{ id: string }[]>(page, 'GET', `payments?household_id=eq.${householdId}&idempotency_key=not.is.null&select=id`);
  for (const { id } of recorded) await memberRest(page, 'POST', 'rpc/undo_payment', { p_payment_id: id });
}
