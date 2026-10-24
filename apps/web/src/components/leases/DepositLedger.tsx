'use client';

import { depositActions, type DepositKind, type DepositState } from '@esta/core/allocation';
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
 * An action with the ledger as it stood when the action was offered. Its sheet works against that ledger while it is
 * open and while it closes, when the save's revalidation has already redrawn the page with the new entry.
 */
type DepositAction = { readonly kind: DepositKind; readonly offer: DepositOffer; readonly state: DepositState; readonly rows: readonly DepositRowView[] };

function depositActionsOn(offer: DepositOffer, rows: readonly DepositRowView[], heldVnd: Vnd): DepositAction[] {
  const state = { active: offer.active, heldVnd, hasEntries: rows.length > 0, owesInvoice: offer.openInvoices.length > 0 };
  return depositActions(state).map((kind) => ({ kind, offer, state, rows }));
}

/**
 * LSE-9 on lease detail: what this lease holds as its tenant's deposit, every movement in date order with the balance
 * after it, and the actions `depositActions` allows. They are outline buttons, so the accent keeps marking the page's one
 * primary action (DESIGN.md One Accent Rule).
 */
export function DepositLedger({ rows, held, contractVnd, offer }: { rows: readonly DepositRowView[]; held: Vnd; contractVnd: Vnd | null; offer: DepositOffer | null }) {
  const t = useTranslations('deposits');
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [opening, setOpening] = useState<(DepositAction & { readonly count: number }) | null>(null);
  const actions = offer === null ? [] : depositActionsOn(offer, rows, held);

  return (
    <section aria-labelledby="lease-deposit-ledger" data-testid="deposit-ledger" className="flex flex-col gap-4 rounded-lg border border-rule bg-surface p-5 shadow-card sm:p-6">
      <h2 id="lease-deposit-ledger" className="text-lead font-semibold text-ink">
        {t('title')}
      </h2>
      {rows.length === 0 ? (
        <div className="flex flex-col items-start gap-3">
          <p className="flex items-center gap-3 text-body font-medium text-ink">
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
            {contractVnd === null || held === 0 || contractVnd === held ? null : (
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
                className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-0.5 border-b border-rule py-3 last:border-b-0"
              >
                <span className="text-body font-medium text-ink">{t('kind', { kind: row.kind })}</span>
                <MoneyDisplay amount={vnd(row.kind === 'received' ? row.amountVnd : -row.amountVnd)} variant="signed" className="text-body font-medium text-ink" />
                <span className="text-small text-ink-muted figures">{formatDate(row.onDate, locale)}</span>
                <span className="text-end text-small text-ink-muted figures">{t('heldAfter', { amount: formatVnd(row.heldVnd, locale) })}</span>
                {row.invoicePeriodStart === null ? null : (
                  <span className="col-span-2 text-small text-ink-2 figures">{t('appliedTo', { date: formatDate(row.invoicePeriodStart, locale) })}</span>
                )}
                {row.note === null ? null : <span className="col-span-2 text-small break-words text-ink-2">{row.note}</span>}
              </li>
            ))}
          </ol>
        </>
      )}
      {actions.length === 0 ? null : (
        <div data-testid="deposit-actions" className="flex flex-wrap gap-3">
          {actions.map((action) => (
            <Button
              key={action.kind}
              type="button"
              variant="outline"
              data-testid={`deposit-${action.kind}`}
              aria-haspopup="dialog"
              aria-expanded={open && opening?.kind === action.kind}
              onClick={() => {
                setOpening((last) => ({ ...action, count: (last?.count ?? 0) + 1 }));
                setOpen(true);
              }}
            >
              {t('action', { kind: action.kind })}
            </Button>
          ))}
        </div>
      )}
      {opening === null ? null : (
        <Suspense fallback={null}>
          <DepositSheet
            key={opening.count}
            kind={opening.kind}
            open={open}
            onOpenChange={setOpen}
            offer={opening.offer}
            state={opening.state}
            rows={opening.rows}
            contractVnd={contractVnd}
          />
        </Suspense>
      )}
    </section>
  );
}
