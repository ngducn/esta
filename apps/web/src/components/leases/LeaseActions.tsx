'use client';

import type { IsoDate } from '@esta/core/date';
import type { Vnd } from '@esta/core/money';
import { useTranslations } from 'next-intl';
import { lazy, Suspense, useState } from 'react';
import { Button } from '@/components/ui/button';

const AmendLeaseSheet = lazy(() => import('./AmendLeaseSheet'));
const TerminateLeaseDialog = lazy(() => import('./TerminateLeaseDialog'));
const RenewLeaseSheet = lazy(() => import('./RenewLeaseSheet'));

export type RenewalOffer = { readonly start: IsoDate; readonly startsBeforeToday: boolean; readonly lastRentVnd: Vnd; readonly defaultEnd: IsoDate };

/** What a member can do next with this lease. An ended or terminated lease offers no amend or terminate (LSE-2). */
export function LeaseActions({
  leaseId,
  unitLabel,
  leasesHref,
  active,
  amendStarts,
  renewal,
}: {
  leaseId: string;
  unitLabel: string;
  leasesHref: string;
  active: boolean;
  amendStarts: readonly IsoDate[];
  renewal: RenewalOffer | null;
}) {
  const t = useTranslations('leases');
  const [open, setOpen] = useState<'amend' | 'terminate' | 'renew' | null>(null);
  const close = () => setOpen(null);
  if (!active && renewal === null) return null;
  return (
    <div data-testid="lease-actions" className="flex flex-wrap gap-3">
      {renewal === null ? null : (
        <Button type="button" data-testid="lease-renew" onClick={() => setOpen('renew')}>
          {t('actionRenew')}
        </Button>
      )}
      {active ? (
        <>
          <Button type="button" variant="outline" data-testid="lease-amend" onClick={() => setOpen('amend')}>
            {t('actionAmend')}
          </Button>
          <Button type="button" variant="outline" data-testid="lease-terminate" onClick={() => setOpen('terminate')}>
            {t('actionTerminate')}
          </Button>
        </>
      ) : null}
      <Suspense fallback={null}>
        {open === 'amend' ? <AmendLeaseSheet leaseId={leaseId} starts={amendStarts} onClose={close} /> : null}
        {open === 'terminate' ? <TerminateLeaseDialog leaseId={leaseId} unitLabel={unitLabel} onClose={close} /> : null}
        {open === 'renew' && renewal !== null ? (
          <RenewLeaseSheet
            leaseId={leaseId}
            start={renewal.start}
            startsBeforeToday={renewal.startsBeforeToday}
            lastRentVnd={renewal.lastRentVnd}
            defaultEnd={renewal.defaultEnd}
            leasesHref={leasesHref}
            onClose={close}
          />
        ) : null}
      </Suspense>
    </div>
  );
}
