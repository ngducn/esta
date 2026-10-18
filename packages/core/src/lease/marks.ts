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
 * The mark a unit shows on the Cho thuê tab: its live lease's oldest open invoice, else draft or vacant. An open invoice
 * is an issued one still owed; until payments exist (P3-09) that is every issued invoice.
 */
export function unitLeaseMark(leases: readonly { readonly status: LeaseStatus; readonly openDueDates: readonly IsoDate[] }[], asOf: IsoDate): LeaseMark {
  const active = leases.find((lease) => lease.status === 'active');
  if (active === undefined) return leases.some((lease) => lease.status === 'draft') ? { kind: 'draft' } : { kind: 'vacant' };
  const oldest = active.openDueDates.toSorted()[0];
  if (oldest === undefined) return { kind: 'clear' };
  if (oldest < asOf) return { kind: 'overdue', days: daysBetween(oldest, asOf), dueDate: oldest };
  return oldest === asOf ? { kind: 'due', dueDate: oldest } : { kind: 'upcoming', dueDate: oldest };
}
