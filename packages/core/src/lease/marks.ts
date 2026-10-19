import { daysBetween } from '../date/calendar';
import type { IsoDate } from '../date/iso-date';
import type { LeaseStatus } from './types';

export type LeaseMark =
  | { readonly kind: 'overdue'; readonly days: number; readonly dueDate: IsoDate }
  | { readonly kind: 'due'; readonly dueDate: IsoDate }
  | { readonly kind: 'upcoming'; readonly dueDate: IsoDate }
  | { readonly kind: 'clear' }
  | { readonly kind: 'draft' }
  | { readonly kind: 'vacant' };

/**
 * The mark a unit shows on the Cho thuê tab for its `currentLease`: that lease's oldest open invoice, else draft, and
 * vacant when it has none. An open invoice is an issued one still owed (`invoice_balances.outstanding_vnd` above zero).
 */
export function unitLeaseMark(lease: { readonly status: LeaseStatus; readonly openDueDates: readonly IsoDate[] } | undefined, asOf: IsoDate): LeaseMark {
  if (lease === undefined) return { kind: 'vacant' };
  if (lease.status === 'draft') return { kind: 'draft' };
  const oldest = lease.openDueDates.toSorted()[0];
  if (oldest === undefined) return { kind: 'clear' };
  if (oldest < asOf) return { kind: 'overdue', days: daysBetween(oldest, asOf), dueDate: oldest };
  return oldest === asOf ? { kind: 'due', dueDate: oldest } : { kind: 'upcoming', dueDate: oldest };
}
