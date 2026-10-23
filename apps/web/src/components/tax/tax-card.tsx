import type { IsoDate } from '@esta/core/date';
import { formatDate, formatVnd, type Locale } from '@esta/core/format';
import { vnd, type Vnd } from '@esta/core/money';
import type { TaxPosition, TaxRule } from '@esta/core/tax';
import { ChevronRight } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { StatusShape } from '@/components/status-mark';
import type { TaxLeaseLine } from '@/server/tax/load';
import { taxNoteText } from './note-text';

const CARD = 'flex flex-col gap-4 rounded-lg border border-rule bg-surface p-5 shadow-card sm:p-6';

/** `Ước tính, không phải tư vấn thuế` with the rule's source, under every group of tax figures (FIN-3). */
async function Disclaimer({ rule }: { rule: TaxRule }) {
  const notes = await getTranslations('taxNotes');
  return (
    <p data-testid="tax-disclaimer" className="text-small text-ink-2">
      {notes('estimateDisclaimer')}. {notes('source', { citation: rule.sourceCitation })}
    </p>
  );
}

function Figure({ label, amount, testId, locale }: { label: string; amount: Vnd; testId: string; locale: Locale }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-small text-ink-2">{label}</dt>
      <dd data-testid={testId} className="text-h2 font-bold text-ink figures">
        <data value={amount}>{formatVnd(amount, locale)}</data>
      </dd>
    </div>
  );
}

/** The thin rule toward the threshold: the fill is ink and the words carry the meaning, never the color. */
function ThresholdRule({ position, label }: { position: TaxPosition; label: string }) {
  const percent = Math.min(100, position.progressBp / 100);
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={10_000}
      aria-valuenow={Math.min(position.progressBp, 10_000)}
      aria-valuetext={label}
      data-testid="tax-threshold-rule"
      data-progress-bp={position.progressBp}
      className="h-2.5 overflow-hidden rounded-full border border-rule bg-surface-2"
    >
      <svg viewBox="0 0 100 1" preserveAspectRatio="none" aria-hidden="true" className="block size-full">
        <rect width={percent} height="1" className="fill-ink" />
      </svg>
    </div>
  );
}

export async function TaxPositionCard({ position, rule, otherBusinessRevenueVnd, year, asOf }: { position: TaxPosition; rule: TaxRule; otherBusinessRevenueVnd: Vnd; year: number; asOf: IsoDate }) {
  const [t, locale] = await Promise.all([getTranslations('taxCard'), getLocale() as Promise<Locale>]);
  const money = (amount: Vnd) => formatVnd(amount, locale);
  const threshold = money(position.thresholdVnd);
  const progress = position.overThreshold ? t('over', { threshold }) : t('progress', { percent: Math.floor(position.progressBp / 100), threshold });
  return (
    <section aria-labelledby="tax-position-title" data-testid="tax-position" data-over={position.overThreshold} className={CARD}>
      <div className="flex flex-col gap-2">
        <h2 id="tax-position-title" className="text-body font-semibold text-ink-2">
          {t('projected', { year })}
        </h2>
        <p data-testid="tax-projected" className="text-hero font-bold tracking-tight text-ink figures">
          <data value={position.projectedVnd}>{money(position.projectedVnd)}</data>
        </p>
        <ThresholdRule position={position} label={progress} />
        <p data-testid="tax-progress" className="flex items-center gap-2 text-body font-semibold text-ink">
          {position.overThreshold ? <StatusShape status="overdue" className="size-4 shrink-0" /> : null}
          <span className="figures">{progress}</span>
        </p>
        {position.overThreshold ? null : (
          <p data-testid="tax-remaining" className="text-body text-ink figures">
            {t('remaining', { amount: money(position.remainingToThresholdVnd) })}
          </p>
        )}
        {otherBusinessRevenueVnd > 0 ? (
          <p data-testid="tax-threshold-total" className="text-body text-ink-2 figures">
            {t('thresholdTotal', { other: money(otherBusinessRevenueVnd), total: money(position.thresholdTotalVnd) })}
          </p>
        ) : null}
        <p data-testid="tax-accrued" className="text-body text-ink-2 figures">
          {t('accrued', { date: formatDate(asOf, locale), amount: money(position.accruedVnd) })}
        </p>
        <Disclaimer rule={rule} />
      </div>
      <div className="flex flex-col gap-3 border-t border-rule pt-4">
        <h3 className="text-lead font-bold text-ink">{t('estimates')}</h3>
        <dl className="grid grid-cols-1 gap-4 min-[22rem]:grid-cols-2">
          <Figure label={t('vat')} amount={position.vatEstimateVnd} testId="tax-vat" locale={locale} />
          <Figure label={t('pit')} amount={position.pitEstimateVnd} testId="tax-pit" locale={locale} />
        </dl>
        {position.withheldLeases.length > 0 ? (
          <p data-testid="tax-self-declared" className="text-body text-ink-2 figures">
            {t('selfDeclared', { amount: money(position.selfDeclaredVnd) })}
          </p>
        ) : null}
        <Disclaimer rule={rule} />
      </div>
    </section>
  );
}

function LeaseRows({ lines, label, locale, testId }: { lines: readonly TaxLeaseLine[]; label: (line: TaxLeaseLine) => string; locale: Locale; testId: string }) {
  return (
    <ul className="flex flex-col divide-y divide-rule">
      {lines.map((line) => (
        <li key={line.leaseId}>
          <Link
            href={line.href}
            data-testid={testId}
            data-lease-id={line.leaseId}
            className="flex min-h-touch flex-wrap items-center gap-x-3 gap-y-1 py-3 text-body text-ink transition-colors duration-(--duration-fast) ease-standard hover:text-ink-2"
          >
            <span className="flex min-w-0 flex-[1_1_12rem] flex-col">
              <span className="font-semibold wrap-anywhere">
                {line.property}, {line.unit}
              </span>
              <span className="text-small text-ink-2">{label(line)}</span>
            </span>
            <span className="ms-auto shrink-0 text-end font-semibold figures">
              <data value={line.projectedVnd}>{formatVnd(line.projectedVnd, locale)}</data>
            </span>
            <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-ink-muted" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export async function TaxLeasesCard({
  declared,
  withheld,
  position,
  rule,
  owner,
  year,
}: {
  declared: readonly TaxLeaseLine[];
  withheld: readonly TaxLeaseLine[];
  position: TaxPosition;
  rule: TaxRule;
  owner: string;
  year: number;
}) {
  const [t, locale] = await Promise.all([getTranslations('taxCard'), getLocale() as Promise<Locale>]);
  const label = (line: TaxLeaseLine) => (line.shareBp === null ? t('wholeLease') : t('share', { percent: line.shareBp / 100 }));
  const withheldTotal = vnd(position.withheldLeases.reduce((sum, lease) => sum + lease.projectedVnd, 0));
  return (
    <section aria-labelledby="tax-leases-title" data-testid="tax-leases" className={CARD}>
      <h2 id="tax-leases-title" className="text-lead font-bold text-ink">
        {t('leases', { year })}
      </h2>
      {declared.length === 0 && withheld.length === 0 ? <p className="text-body text-ink-2">{t('noLeases', { owner, year })}</p> : null}
      {declared.length > 0 ? <LeaseRows lines={declared} label={label} locale={locale} testId="tax-lease" /> : null}
      {withheld.length > 0 ? (
        <details data-testid="tax-withheld" className="group rounded-md border border-rule bg-surface-2">
          <summary className="flex min-h-touch cursor-pointer items-center gap-2 px-4 py-2 text-body font-semibold text-ink">
            <ChevronRight aria-hidden="true" className="size-5 shrink-0 transition-transform duration-(--duration-fast) ease-standard group-open:rotate-90" />
            <span className="figures">{t('withheld', { count: withheld.length, amount: formatVnd(withheldTotal, locale) })}</span>
          </summary>
          <div className="flex flex-col gap-2 border-t border-rule bg-surface px-4 pb-1">
            <p className="pt-3 text-small text-ink-2">{t('withheldBody')}</p>
            <LeaseRows lines={withheld} label={label} locale={locale} testId="tax-withheld-lease" />
          </div>
        </details>
      ) : null}
      <Disclaimer rule={rule} />
    </section>
  );
}

export async function TaxNotesCard({ position, rule }: { position: TaxPosition; rule: TaxRule }) {
  const [t, notes] = await Promise.all([getTranslations('taxCard'), getTranslations('taxNotes')]);
  const keys = position.noteKeys.filter((key) => key !== 'estimate_disclaimer');
  return (
    <section aria-labelledby="tax-notes-title" data-testid="tax-notes" className={CARD}>
      <h2 id="tax-notes-title" className="text-lead font-bold text-ink">
        {t('notes')}
      </h2>
      <ul className="flex list-disc flex-col gap-2 ps-5 text-body text-ink">
        {keys.map((key) => (
          <li key={key} data-note={key} className="wrap-anywhere">
            {taxNoteText(key, rule, notes)}
          </li>
        ))}
      </ul>
    </section>
  );
}
