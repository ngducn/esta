import { formatDate } from '@esta/core/format';
import { formatShareBp, ownershipStatus } from '@esta/core/properties/ownership';
import type { OwnershipShare } from '@esta/core/schemas/ownership';
import { compareVietnameseNames } from '@esta/core/names';
import { Check, Users } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import type { PartyOption } from '@/server/properties/legal';
import { OwnershipWarning } from './ownership-warning';

export async function OwnersSection({
  shares,
  parties,
  editor,
}: {
  shares: readonly OwnershipShare[];
  parties: ReadonlyMap<string, PartyOption>;
  editor: ReactNode;
}) {
  const [t, locale] = await Promise.all([getTranslations('propertyOwners'), getLocale()]);
  if (shares.length === 0) {
    return (
      <div data-testid="owners-empty" className="flex flex-col items-start gap-3 rounded-lg border border-rule bg-surface p-5 shadow-card sm:p-6">
        <p className="flex items-center gap-3 text-lead font-bold text-ink">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent-tint text-accent">
            <Users className="size-5" strokeWidth={1.8} aria-hidden="true" />
          </span>
          {t('empty')}
        </p>
        <p className="max-w-prose text-body text-pretty text-ink-2">{t('emptyBody')}</p>
        {editor}
      </div>
    );
  }
  const name = (share: OwnershipShare) => parties.get(share.party_id)?.fullName ?? t('unknownParty');
  const rows = shares.toSorted((a, b) => b.share_bp - a.share_bp || compareVietnameseNames(name(a), name(b)));
  return (
    <div className="flex flex-col gap-3">
      <OwnershipWarning status={ownershipStatus(shares)} />
      <ul className="flex flex-col divide-y divide-rule rounded-lg border border-rule bg-surface shadow-card">
        {rows.map((share) => (
          <li key={share.party_id} data-testid="owner-row" data-party={share.party_id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3 sm:px-5">
            <p className="min-w-0 flex-1 text-lead font-bold break-words text-ink">{name(share)}</p>
            <p data-testid="owner-share-value" className="figures text-lead font-bold text-ink">
              {formatShareBp(share.share_bp, locale)}
            </p>
            {share.named_on_certificate || share.since !== null ? (
              <div className="flex w-full flex-wrap gap-x-4 gap-y-1 text-small text-ink-2">
                {share.named_on_certificate ? (
                  <span data-testid="owner-named-mark" className="inline-flex items-center gap-1.5">
                    <Check className="size-4 text-paid" strokeWidth={2.25} aria-hidden="true" />
                    {t('named')}
                  </span>
                ) : null}
                {share.since === null ? null : <span className="figures">{t('since', { date: formatDate(share.since, locale) })}</span>}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
