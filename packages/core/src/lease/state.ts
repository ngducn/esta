import type { IsoDate } from '../date/iso-date';
import type { Vnd } from '../money/vnd';
import type { LeaseStatus } from './types';

/** SPEC §5.4. `ended` and `terminated` are final; a renewal is a new lease. */
export const LEASE_TRANSITIONS = {
  draft: ['active'],
  active: ['ended', 'terminated'],
  ended: [],
  terminated: [],
} as const satisfies Record<LeaseStatus, readonly LeaseStatus[]>;

export type ActivationFacts = {
  readonly status: LeaseStatus;
  readonly tenantPartyId: string | null;
  readonly startDate: IsoDate | null;
  readonly endDate: IsoDate | null;
  readonly rentVnd: Vnd | null;
};

export type ActivationRefusal = 'not_draft' | 'missing_tenant' | 'missing_start' | 'missing_rent' | 'paid_through_before_start';

/** Every reason activation is refused, in the order the form shows them, so Mẹ fixes them in one pass. */
export function activationRefusals(lease: ActivationFacts, paidThroughDate: IsoDate | null): ActivationRefusal[] {
  if (!(LEASE_TRANSITIONS[lease.status] as readonly LeaseStatus[]).includes('active')) return ['not_draft'];
  const refusals: ActivationRefusal[] = [];
  if (lease.tenantPartyId === null) refusals.push('missing_tenant');
  if (lease.startDate === null) refusals.push('missing_start');
  if (lease.rentVnd === null) refusals.push('missing_rent');
  if (paidThroughDate !== null && lease.startDate !== null && paidThroughDate < lease.startDate) refusals.push('paid_through_before_start');
  return refusals;
}
