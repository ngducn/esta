'use client';

import { formatVnd } from '@esta/core/format';
import type { Vnd } from '@esta/core/money';
import { vndInputText } from '@esta/core/properties/form';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { MoneyInput } from '@/components/money/money-input';
import { StatusShape } from '@/components/status-mark';
import { buttonVariants } from '@/components/ui/button-variants';
import { useAction } from '@/components/use-action';
import { saveOtherBusinessRevenue, type TaxSaveRefusal } from '@/server/tax/actions';

const ERRORS = { empty: 'errorEmpty', invalid: 'errorInvalid', forbidden: 'errorForbidden', failed: 'errorFailed' } as const satisfies Record<TaxSaveRefusal, string>;

/**
 * `Doanh thu kinh doanh khác` for one owner and year. A save revalidates `/reports/tax`, so the card beside it redraws
 * from the saved row; a second tap with the same amount writes nothing.
 */
export function OtherRevenueForm({ partyId, year, savedVnd, canEdit }: { partyId: string; year: number; savedVnd: Vnd; canEdit: boolean }) {
  const t = useTranslations('taxCard');
  const locale = useLocale();
  const [text, setText] = useState(() => vndInputText(savedVnd));
  const [status, setStatus] = useState<'idle' | 'saved' | TaxSaveRefusal>('idle');
  const { pending, run } = useAction();

  const save = () =>
    run(
      () => saveOtherBusinessRevenue({ partyId, year, amount: text }),
      (result) => setStatus(result.ok ? 'saved' : result.reason),
    );

  return (
    <section aria-labelledby="tax-other-title" data-testid="tax-other-revenue" className="flex flex-col gap-3 rounded-lg border border-rule bg-surface p-5 shadow-card sm:p-6">
      <h2 id="tax-other-title" className="text-lead font-semibold text-ink">
        {t('otherRevenue')}
      </h2>
      <p className="text-body text-ink-2">{t('otherRevenueBody', { year })}</p>
      {canEdit ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <MoneyInput
            label={t('amount', { year })}
            defaultText={text}
            onTextChange={(next) => {
              setText(next);
              setStatus('idle');
            }}
            disabled={pending}
          />
          <button type="submit" data-testid="tax-other-save" disabled={pending} className={buttonVariants({ variant: 'primary' })}>
            {pending ? t('saving') : t('save')}
          </button>
          <p aria-live="polite" data-testid="tax-other-status" data-status={status} className="min-h-6 text-body">
            {status === 'saved' ? <span className="text-ink">{t('saved')}</span> : null}
            {status !== 'idle' && status !== 'saved' ? (
              <span role="alert" className="flex items-start gap-2 text-overdue">
                <StatusShape status="overdue" className="mt-1 size-4 shrink-0" />
                {t(ERRORS[status])}
              </span>
            ) : null}
          </p>
        </form>
      ) : (
        <p data-testid="tax-other-readonly" className="text-body font-medium text-ink figures">
          {formatVnd(savedVnd, locale)}
        </p>
      )}
    </section>
  );
}
