import { parseInstant } from '@esta/core';
import { activityTime } from '@esta/core/activity';
import { formatMonthYear } from '@esta/core/format';
import { isoDateSchema } from '@esta/core/schemas/legal';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { UndoBatchRow } from '@/components/history/undo-batch-row';
import { BackLink } from '@/components/properties/back-link';
import { PropertyIntl } from '@/components/properties/property-intl';
import { env } from '@/server/env';
import { requireMember } from '@/server/member';
import { historyIslandIntl } from '@/server/properties/island-messages';
import { createSessionClient } from '@/server/supabase/server';

const historySchema = z.array(
  z.object({
    id: z.string(),
    summary: z.string(),
    status: z.enum(['applied', 'partial', 'undone']),
    planned_at: z.string().transform(parseInstant),
    applied_at: z.string().transform(parseInstant).nullable(),
    planner_name: z.string().nullable(),
    archived_properties: z.number(),
    issued_bills: z.array(z.object({ number: z.string(), period_start: isoDateSchema })),
  }),
);

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('history');
  return { title: t('title') };
}

export default async function ChangeHistoryPage() {
  const member = await requireMember();
  if (!member.isOperator) notFound();
  const [db, t, nav, intl] = await Promise.all([createSessionClient(), getTranslations('history'), getTranslations('nav'), historyIslandIntl()]);
  const { data, error } = await db.rpc('change_batch_history', { p_household_id: member.household.id });
  if (error) throw new Error(`Reading the change history failed: ${error.message}`);
  const batches = historySchema.parse(data);

  return (
    <div className="flex flex-col gap-5">
      <BackLink href="/settings" label={nav('settings')} />
      <div className="flex flex-col gap-2">
        <h1 className="text-h2 break-words lg:text-h1">{t('title')}</h1>
        <p className="max-w-prose text-ink-2">{t('intro')}</p>
      </div>
      {batches.length === 0 ? (
        <p className="max-w-3xl rounded-lg border border-rule bg-surface p-5 text-body text-ink-2 shadow-card">{t('empty')}</p>
      ) : (
        <PropertyIntl locale={intl.locale} messages={intl.messages}>
          <ul data-testid="batch-list" className="flex max-w-3xl flex-col divide-y divide-rule rounded-lg border border-rule bg-surface shadow-card">
            {batches.map((batch) => {
              const { time, date } = activityTime(batch.applied_at ?? batch.planned_at, env.ESTA_TIMEZONE);
              const lines = (
                <>
                  <p className="text-body font-semibold text-ink wrap-anywhere">{batch.summary}</p>
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-ink-muted">
                    <span className="rounded-full bg-surface-2 px-2 font-semibold text-ink-2">{t('via')}</span>
                    <span>{t('entry', { name: batch.planner_name ?? t('someone'), time, date })}</span>
                    <span data-testid="batch-status" className={batch.status === 'undone' ? 'font-semibold text-ink-2' : undefined}>
                      {t('status', { status: batch.status })}
                    </span>
                  </p>
                  {batch.archived_properties > 0 ? (
                    <p className="text-small text-ink-2">
                      {t.rich('archived', {
                        count: batch.archived_properties,
                        link: (chunks) => (
                          <Link href="/properties/archived" className="font-semibold text-ink underline underline-offset-4 hover:decoration-2">
                            {chunks}
                          </Link>
                        ),
                      })}
                    </p>
                  ) : null}
                </>
              );
              return (
                <li key={batch.id} data-testid="batch-row" className="flex flex-col gap-2 p-4 sm:px-5">
                  {batch.status === 'undone' ? (
                    <div className="flex min-w-0 flex-col gap-1">{lines}</div>
                  ) : (
                    <UndoBatchRow
                      batchId={batch.id}
                      summary={batch.summary}
                      body={[
                        t('undoBody'),
                        ...(batch.issued_bills.length === 0
                          ? []
                          : [
                              t('undoBills', {
                                count: batch.issued_bills.length,
                                bills: batch.issued_bills.map((bill) => t('bill', { number: bill.number, month: formatMonthYear(bill.period_start, intl.locale) })).join('; '),
                              }),
                            ]),
                      ].join(' ')}
                    >
                      {lines}
                    </UndoBatchRow>
                  )}
                </li>
              );
            })}
          </ul>
        </PropertyIntl>
      )}
    </div>
  );
}
