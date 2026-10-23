import 'server-only';
import type { IsoDate } from '@esta/core/date';
import type { ExportTable } from '@esta/core/export';
import { formatDate, formatMonthWithin, type Locale } from '@esta/core/format';
import { monthlyCollections, propertyPnl, rentRoll, yearPeriod, type ReportSnapshot } from '@esta/core/reports';
import { readReportSnapshot } from '@esta/ops';
import { getLocale, getTranslations } from 'next-intl/server';
import { createSessionClient } from '@/server/supabase/server';

type Translate = Awaited<ReturnType<typeof getTranslations<'reports'>>>;
type Place = Awaited<ReturnType<typeof getTranslations<'collections'>>>;

type ReportDefinition = {
  /** The message key of its name, title, basis, empty line and sheet name. */
  readonly key: 'pnl' | 'rentRoll' | 'collections';
  /** A yearly report reads the chosen year; the others read the Clock's date. */
  readonly yearly: boolean;
  readonly build: (snapshot: ReportSnapshot, t: Translate, place: Place, locale: Locale) => ExportTable;
  /** Nothing to report: the report shows its empty line instead of a table of zeros. */
  readonly empty: (snapshot: ReportSnapshot) => boolean;
  /** The column that carries each row's result. */
  readonly strong: string | null;
  /** The download's name without its extension. */
  readonly file: (year: number, today: IsoDate) => string;
};

/** The reports Báo cáo offers beside the tax card, in picker order, by their `?report=` value. */
export const REPORT_KINDS = ['pnl', 'rent-roll', 'collections'] as const;

export type ReportKind = (typeof REPORT_KINDS)[number];

export const isReportKind = (value: string): value is ReportKind => (REPORT_KINDS as readonly string[]).includes(value);

export const REPORTS: Readonly<Record<ReportKind, ReportDefinition>> = {
  pnl: {
    key: 'pnl',
    yearly: true,
    empty: (snapshot) => snapshot.properties.length === 0,
    strong: 'noi',
    file: (year) => `lai-lo-${year}`,
    build: (snapshot, t) => propertyPnl(snapshot, { property: t('property'), income: t('income'), expenses: t('expenses'), noi: t('noi'), total: t('total') }),
  },
  'rent-roll': {
    key: 'rentRoll',
    yearly: false,
    empty: (snapshot) => snapshot.leases.length === 0,
    strong: null,
    file: (_year, today) => `danh-sach-thue-${today}`,
    build: (snapshot, t, place, locale) =>
      rentRoll(snapshot, {
        place: t('place'),
        tenant: t('tenant'),
        rent: t('rent'),
        cycle: t('cycle'),
        paidThrough: t('paidThrough'),
        nextDue: t('nextDue'),
        deposit: t('deposit'),
        endDate: t('endDate'),
        total: t('total'),
        placeName: (unit, property) => place('place', { unit, property }),
        cycleMonths: (months) => t('cycleMonths', { months }),
        date: (date) => formatDate(date, locale),
        none: t('none'),
        openEnded: t('openEnded'),
      }),
  },
  collections: {
    key: 'collections',
    yearly: true,
    empty: (snapshot) => snapshot.invoices.length === 0,
    strong: 'outstanding',
    file: (year) => `thu-tien-${year}`,
    build: (snapshot, t, _place, locale) =>
      monthlyCollections(snapshot, {
        month: t('month'),
        monthName: (first) => t('monthName', { month: formatMonthWithin(first, first, locale) }),
        billed: t('billed'),
        collected: t('collected'),
        outstanding: t('outstanding'),
        total: t('total'),
      }),
  },
};

export type ReportView = {
  readonly table: ExportTable;
  readonly title: string;
  readonly basis: string;
  readonly empty: string | null;
  readonly strong: string | null;
  readonly sheet: string;
  readonly file: string;
};

/** The report as Báo cáo shows it and its download writes it: one table from one snapshot. */
export async function loadReport(householdId: string, kind: ReportKind, year: number, today: IsoDate): Promise<ReportView> {
  const report = REPORTS[kind];
  const period = report.yearly ? yearPeriod(year, today) : { from: today, to: today };
  const [snapshot, t, place, locale] = await Promise.all([
    readReportSnapshot(await createSessionClient(), householdId, { ...period, asOf: today }),
    getTranslations('reports'),
    getTranslations('collections'),
    getLocale() as Promise<Locale>,
  ]);
  return {
    table: report.build(snapshot, t, place, locale),
    title: t(`${report.key}Title`, { year, date: formatDate(today, locale) }),
    basis: t(`${report.key}Basis`),
    empty: report.empty(snapshot) ? t(`${report.key}Empty`, { year }) : null,
    strong: report.strong,
    sheet: t(`${report.key}Sheet`, { year }),
    file: report.file(year, today),
  };
}
