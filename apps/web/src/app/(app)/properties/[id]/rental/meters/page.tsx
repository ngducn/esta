import { boardMonthParam, parseBoardMonth } from '@esta/core/collections';
import { addMonths, firstOfMonth } from '@esta/core/date/calendar';
import { formatMonthWithin, formatMonthYear } from '@esta/core/format';
import { idSchema } from '@esta/ops';
import { ChevronLeft, ChevronRight, Gauge } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EmptyState } from '@/components/empty-state';
import { MeterEntryList } from '@/components/meters/MeterEntryList';
import { BackLink } from '@/components/properties/back-link';
import { PropertyIntl } from '@/components/properties/property-intl';
import { StatusShape, statusMarks } from '@/components/status-mark';
import { buttonVariants } from '@/components/ui/button-variants';
import { cn } from '@/lib/utils';
import { getClock } from '@/server/clock';
import { requireMember } from '@/server/member';
import { loadMeterEntry } from '@/server/meters/load';
import { loadPropertyDetail } from '@/server/properties/detail';
import { meterIslandIntl } from '@/server/properties/island-messages';

type Params = Promise<{ id: string }>;
type Search = Promise<{ month?: string | string[] }>;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meters');
  return { title: t('title') };
}

/** LSE-4 meter entry for the month before the Clock's month, or the earlier month `?month=2026-09` names. */
export default async function MeterEntryPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const [{ id }, search, clock] = await Promise.all([params, searchParams, getClock()]);
  if (!idSchema.safeParse(id).success) notFound();
  const today = clock.today();
  const latest = firstOfMonth(today);
  const asked = parseBoardMonth(typeof search.month === 'string' ? search.month : undefined, addMonths(today, -1));
  const month = asked > latest ? latest : asked;
  const [member, property, intl, t] = await Promise.all([requireMember(), loadPropertyDetail(id), meterIslandIntl(), getTranslations('meters')]);
  if (property === null) notFound();
  const rooms = await loadMeterEntry(id, month);
  const remaining = rooms.filter((room) => room.meters.some((meter) => meter.stored === null)).length;
  const status = remaining === 0 ? 'paid' : 'due';
  const monthLabel = formatMonthYear(month, intl.locale);
  const monthLink = (offset: -1 | 1) => {
    const target = addMonths(month, offset);
    const label = t('monthHeading', { month: formatMonthWithin(target, month, intl.locale) });
    return (
      <Link
        href={`/properties/${id}/rental/meters?month=${boardMonthParam(target)}`}
        data-testid={offset < 0 ? 'meter-month-previous' : 'meter-month-next'}
        className={buttonVariants({ variant: 'outline', className: 'px-3' })}
      >
        {offset < 0 ? <ChevronLeft aria-hidden="true" /> : null}
        {label}
        {offset > 0 ? <ChevronRight aria-hidden="true" /> : null}
      </Link>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <BackLink href={`/properties/${id}/rental`} label={property.nickname} />
      <div className="flex flex-col gap-3">
        <h1 className="text-h2 break-words text-balance lg:text-h1">{t('title')}</h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <nav aria-label={t('monthNav')} className="flex w-full flex-wrap items-center justify-between gap-2 sm:w-auto sm:justify-start">
            {monthLink(-1)}
            <p data-testid="meter-month" aria-current="page" className="figures order-first basis-full text-lead font-semibold text-ink sm:order-none sm:basis-auto sm:px-1">
              {t('monthHeading', { month: monthLabel })}
            </p>
            {month < latest ? monthLink(1) : null}
          </nav>
          {rooms.length === 0 ? null : (
            <p data-testid="meter-remaining" data-status={status} className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-small font-medium', statusMarks[status].pill)}>
              <StatusShape status={status} className="size-4" />
              {remaining === 0 ? t('complete', { count: rooms.length }) : t('remaining', { count: remaining })}
            </p>
          )}
        </div>
        {member.role === 'viewer' ? (
          <p data-testid="meter-viewer-note" className="text-body text-ink-2">
            {t('viewerNote')}
          </p>
        ) : null}
      </div>
      {rooms.length === 0 ? (
        <EmptyState title={t('empty')} body={t('emptyBody')} icon={Gauge} />
      ) : (
        <PropertyIntl locale={intl.locale} messages={intl.messages}>
          <MeterEntryList key={month} propertyId={id} month={month} monthLabel={monthLabel} rooms={rooms} canEdit={member.role !== 'viewer'} />
        </PropertyIntl>
      )}
      <p data-testid="meter-price-note" className="max-w-prose text-small text-ink-muted">
        {t('priceNote')}
      </p>
    </div>
  );
}
