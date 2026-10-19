'use client';

import type { DepositKind } from '@esta/core/allocation';
import type { IsoDate } from '@esta/core/date';
import { formatDate, formatVnd } from '@esta/core/format';
import { vnd, type Vnd } from '@esta/core/money';
import { PiggyBank } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { lazy, Suspense, useState } from 'react';
import { MoneyDisplay } from '@/components/money/money-display';
import { Button } from '@/components/ui/button';
import type { DepositLine } from '@/server/leases/deposits';
import type { DepositInvoice } from './DepositSheet';

const DepositSheet = lazy(() => import('./DepositSheet'));

export type DepositRowView = DepositLine & { readonly heldVnd: Vnd };

/** What a member may do with this lease's deposit; null for a viewer. */
export type DepositOffer = {
  readonly leaseId: string;
  readonly unitLabel: string;
  readonly today: IsoDate;
  /** Issued invoices of this lease that still owe, oldest due first. */
  readonly openInvoices: readonly DepositInvoice[];
  readonly active: boolean;
};

/**
 * LSE-9 on lease detail: what this lease holds as its tenant's deposit, every movement in date order with the balance
 * after it, and what a member can do next. Receiving is offered while the lease runs, or on any lease with nothing
 * recorded; using, deducting and refunding only while something is held, and using only when an invoice still owes.
 * The actions are outline buttons, so the accent keeps marking the page's one primary action (DESIGN.md One Accent Rule).
 */
export function DepositLedger({ rows, held, contractVnd, offer }: { rows: readonly DepositRowView[]; held: Vnd; contractVnd: Vnd | null; offer: DepositOffer | null }) {
  const t = useTranslations('deposits');
  const locale = useLocale();
  const [open, setOpen] = useState<DepositKind | null>(null);
  const actions: readonly DepositKind[] =
    offer === null
      ? []
      : [
          ...(offer.active || rows.length === 0 ? (['received'] as const) : []),
          ...(held > 0 && offer.openInvoices.length > 0 ? (['applied'] as const) : []),
          ...(held > 0 ? (['deduction', 'refunded'] as const) : []),
        ];

  return (
    <section aria-labelledby="lease-deposit-ledger" data-testid="deposit-ledger" className="flex flex-col gap-4 rounded-lg border border-rule bg-surface p-5 shadow-card sm:p-6">
      <h2 id="lease-deposit-ledger" className="text-lead font-bold text-ink">
        {t('title')}
      </h2>
      {rows.length === 0 ? (
        <div className="flex flex-col items-start gap-3">
          <p className="flex items-center gap-3 text-body font-semibold text-ink">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent-tint text-accent">
              <PiggyBank className="size-5" strokeWidth={1.8} aria-hidden="true" />
            </span>
            {t('empty')}
          </p>
          <p className="max-w-prose text-body text-pretty text-ink-2">{offer === null ? t('viewerEmpty') : t('emptyBody')}</p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <span className="text-small text-ink-muted">{t('heldLabel')}</span>
            <span data-testid="deposit-held">
              <MoneyDisplay amount={held} variant="large" className="text-start text-ink" />
            </span>
            {held === 0 ? <p className="text-body text-ink-2">{t('heldNone')}</p> : null}
            {contractVnd === null || contractVnd === held ? null : (
              <p data-testid="deposit-contract" className="text-small text-ink-2 figures">
                {t('contract', { amount: formatVnd(contractVnd, locale) })}
              </p>
            )}
          </div>
          <ol data-testid="deposit-entries" className="flex flex-col">
            {rows.map((row) => (
              <li
                key={row.id}
                data-testid="deposit-entry"
                data-kind={row.kind}
                className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 border-b border-rule py-3 last:border-b-0"
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-body font-semibold text-ink">{t('kind', { kind: row.kind })}</span>
                  <span className="text-small text-ink-muted figures">{formatDate(row.onDate, locale)}</span>
                  {row.invoicePeriodStart === null ? null : (
                    <span className="text-small text-ink-2 figures">{t('appliedTo', { date: formatDate(row.invoicePeriodStart, locale) })}</span>
                  )}
                  {row.note === null ? null : <span className="text-small break-words text-ink-2">{row.note}</span>}
                </div>
                <div className="flex flex-col items-end">
                  <MoneyDisplay amount={vnd(row.kind === 'received' ? row.amountVnd : -row.amountVnd)} variant="signed" className="text-body font-semibold text-ink" />
                  <span className="text-small text-ink-muted figures">{t('heldAfter', { amount: formatVnd(row.heldVnd, locale) })}</span>
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
      {offer === null || actions.length === 0 ? null : (
        <div data-testid="deposit-actions" className="flex flex-wrap gap-3">
          {actions.map((kind) => (
            <Button key={kind} type="button" variant="outline" data-testid={`deposit-${kind}`} onClick={() => setOpen(kind)}>
              {t('action', { kind })}
            </Button>
          ))}
        </div>
      )}
      {offer === null || open === null ? null : (
        <Suspense fallback={null}>
          <DepositSheet kind={open} offer={offer} rows={rows} held={held} contractVnd={contractVnd} onClose={() => setOpen(null)} />
        </Suspense>
      )}
    </section>
  );
}
