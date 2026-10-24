'use client';

import type { IsoDate } from '@esta/core/date';
import type { Vnd } from '@esta/core/money';
import { useTranslations } from 'next-intl';
import { lazy } from 'react';
import { Button } from '@/components/ui/button';
import { DeferredPopup, useDeferredDialog } from '@/components/use-deferred-dialog';

const loadAmend = () => import('./AmendLeaseSheet');
const loadTerminate = () => import('./TerminateLeaseDialog');
const loadRenew = () => import('./RenewLeaseSheet');
const AmendLeaseSheet = lazy(loadAmend);
const TerminateLeaseDialog = lazy(loadTerminate);
const RenewLeaseSheet = lazy(loadRenew);

/** An issued bill, which can stop the lease ending before its period (LSE-2) until it is voided. */
export type IssuedBill = { readonly id: string; readonly number: string; readonly periodStart: IsoDate };

export type RenewalOffer = { readonly start: IsoDate; readonly startsBeforeToday: boolean; readonly lastRentVnd: Vnd; readonly defaultEnd: IsoDate };

/**
 * What a member can do next with this lease. An ended or terminated lease offers no amend or terminate (LSE-2).
 * `renewOnOpen` opens the renew sheet on arrival, as Home's `Gia hạn` asks, when the lease can be renewed.
 */
export function LeaseActions({
  leaseId,
  unitLabel,
  leasesHref,
  active,
  amendStarts,
  renewal,
  renewOnOpen = false,
  issuedBills,
}: {
  leaseId: string;
  unitLabel: string;
  leasesHref: string;
  active: boolean;
  amendStarts: readonly IsoDate[];
  renewal: RenewalOffer | null;
  renewOnOpen?: boolean;
  issuedBills: readonly IssuedBill[];
}) {
  const t = useTranslations('leases');
  const amend = useDeferredDialog(loadAmend);
  const terminate = useDeferredDialog(loadTerminate);
  const renew = useDeferredDialog(loadRenew, renewOnOpen && renewal !== null);
  if (!active && renewal === null) return null;
  return (
    <div data-testid="lease-actions" className="flex flex-wrap gap-3">
      {renewal === null ? null : (
        <Button type="button" data-testid="lease-renew" {...renew.triggerProps}>
          {t('actionRenew')}
        </Button>
      )}
      {active ? (
        <>
          <Button type="button" variant="outline" data-testid="lease-amend" {...amend.triggerProps}>
            {t('actionAmend')}
          </Button>
          <Button type="button" variant="outline" data-testid="lease-terminate" {...terminate.triggerProps}>
            {t('actionTerminate')}
          </Button>
        </>
      ) : null}
      <DeferredPopup dialog={amend} popup={AmendLeaseSheet} props={{ leaseId, starts: amendStarts }} />
      <DeferredPopup dialog={terminate} popup={TerminateLeaseDialog} props={{ leaseId, unitLabel, issuedBills }} />
      {renewal === null ? null : (
        <DeferredPopup
          dialog={renew}
          popup={RenewLeaseSheet}
          props={{ leaseId, start: renewal.start, startsBeforeToday: renewal.startsBeforeToday, lastRentVnd: renewal.lastRentVnd, defaultEnd: renewal.defaultEnd, leasesHref }}
        />
      )}
    </div>
  );
}
