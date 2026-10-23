import 'server-only';
import type { IsoDate } from '@esta/core/date';
import type { ExportTable } from '@esta/core/export';
import { formatBps, formatDate, formatMonthWithin, type Locale } from '@esta/core/format';
import { monthlyCollections, occupancy, ownerSummary, periodThrough, portfolioSummary, propertyPnl, rentRoll, yearPeriod, type ReportSnapshot } from '@esta/core/reports';
import { readReportSnapshot } from '@esta/ops';
import { getLocale, getTranslations } from 'next-intl/server';
import { createSessionClient } from '@/server/supabase/server';

type Translate = Awaited<ReturnType<typeof getTranslations<'reports'>>>;
type Place = Awaited<ReturnType<typeof getTranslations<'collections'>>>;
type Valuations = Awaited<ReturnType<typeof getTranslations<'valuations'>>>;
type Messages = { readonly t: Translate; readonly place: Place; readonly valuations: Valuations; readonly locale: Locale };

type ReportDefinition = {
  /** The message key of its name, title, basis, empty line and sheet name. */
  readonly key: 'pnl' | 'rentRoll' | 'collections' | 'occupancy' | 'portfolio' | 'owners';
  /** A yearly report reads the chosen year; the others read the Clock's date. */
  readonly yearly: boolean;
  readonly build: (snapshot: ReportSnapshot, messages: Messages) => ExportTable;
  /** The message key of the mark its figures carry: estimates, or tax estimates that are not advice. */
  readonly estimate: 'estimate' | 'taxEstimate' | null;
  /** Nothing to report: the report shows its empty line instead of a table of zeros. */
  readonly empty: (snapshot: ReportSnapshot) => boolean;
  /** The column that carries each row's result. */
  readonly strong: string | null;
  /** The download's name without its extension. */
  readonly file: (year: number, today: IsoDate) => string;
};

/** The reports Báo cáo offers beside the tax card, in picker order, by their `?report=` value. */
export const REPORT_KINDS = ['pnl', 'owners', 'rent-roll', 'collections', 'occupancy', 'portfolio'] as const;

export type ReportKind = (typeof REPORT_KINDS)[number];

export const isReportKind = (value: string): value is ReportKind => (REPORT_KINDS as readonly string[]).includes(value);

export const REPORTS: Readonly<Record<ReportKind, ReportDefinition>> = {
  pnl: {
    key: 'pnl',
    yearly: true,
    empty: (snapshot) => snapshot.properties.length === 0,
    strong: 'noi',
    file: (year) => `lai-lo-${year}`,
    estimate: null,
    build: (snapshot, { t }) => propertyPnl(snapshot, { property: t('property'), income: t('income'), expenses: t('expenses'), noi: t('noi'), total: t('total') }),
  },
  'rent-roll': {
    key: 'rentRoll',
    yearly: false,
    empty: (snapshot) => snapshot.leases.length === 0,
    strong: null,
    file: (_year, today) => `danh-sach-thue-${today}`,
    estimate: null,
    build: (snapshot, { t, place, locale }) =>
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
    estimate: null,
    build: (snapshot, { t, locale }) =>
      monthlyCollections(snapshot, {
        month: t('month'),
        monthName: (first) => t('monthName', { month: formatMonthWithin(first, first, locale) }),
        billed: t('billed'),
        collected: t('collected'),
        outstanding: t('outstanding'),
        total: t('total'),
      }),
  },
  occupancy: {
    key: 'occupancy',
    yearly: true,
    empty: (snapshot) => snapshot.units.length === 0,
    strong: 'rate',
    file: (year) => `lap-day-${year}`,
    estimate: null,
    build: (snapshot, { t, place, locale }) =>
      occupancy(snapshot, {
        place: t('place'),
        occupied: t('occupiedDays'),
        vacant: t('vacantDays'),
        rate: t('occupancyRate'),
        vacantFor: t('vacantFor', { date: formatDate(snapshot.asOf, locale) }),
        total: t('total'),
        placeName: (unit, property) => place('place', { unit, property }),
        percent: (bp) => formatBps(bp, locale),
        leased: t('leased'),
        none: t('none'),
      }),
  },
  portfolio: {
    key: 'portfolio',
    yearly: false,
    empty: (snapshot) => snapshot.properties.length === 0,
    strong: 'yield',
    file: (_year, today) => `danh-muc-${today}`,
    estimate: 'estimate',
    build: (snapshot, { t, valuations, locale }) =>
      portfolioSummary(snapshot, {
        property: t('property'),
        value: t('value'),
        valuedOn: t('valuedOn'),
        annualRent: t('annualRent'),
        yield: t('grossYield'),
        total: t('total'),
        dated: (date, method) => t('dated', { date: formatDate(date, locale), method: valuations('method', { method }) }),
        percent: (bp) => formatBps(bp, locale),
        noValuation: t('noValuation'),
        noLease: t('noLease'),
      }),
  },
  owners: {
    key: 'owners',
    yearly: true,
    empty: (snapshot) => snapshot.owners.length === 0,
    strong: 'revenue',
    file: (year) => `chu-so-huu-${year}`,
    estimate: 'taxEstimate',
    build: (snapshot, { t }) =>
      ownerSummary(snapshot, {
        owner: t('owner'),
        revenue: t('taxRevenue'),
        income: t('incomeShare'),
        expenses: t('expensesShare'),
        vat: t('vat'),
        pit: t('pit'),
        total: t('total'),
        unattributed: t('unattributed'),
        noRule: t('noRule'),
      }),
  },
};

export type ReportView = {
  readonly table: ExportTable;
  readonly title: string;
  readonly basis: string;
  readonly estimate: string | null;
  readonly empty: string | null;
  readonly strong: string | null;
  readonly sheet: string;
  readonly file: string;
};

/** The report as Báo cáo shows it and its download writes it: one table from one snapshot. */
export async function loadReport(householdId: string, kind: ReportKind, year: number, today: IsoDate): Promise<ReportView> {
  const report = REPORTS[kind];
  const period = report.yearly ? yearPeriod(year, today) : { from: today, to: today };
  const [snapshot, t, place, valuations, locale] = await Promise.all([
    readReportSnapshot(await createSessionClient(), householdId, { ...period, asOf: today }),
    getTranslations('reports'),
    getTranslations('collections'),
    getTranslations('valuations'),
    getLocale() as Promise<Locale>,
  ]);
  return {
    table: report.build(snapshot, { t, place, valuations, locale }),
    title: t(`${report.key}Title`, { year, date: formatDate(periodThrough(snapshot), locale) }),
    basis: t(`${report.key}Basis`),
    estimate: report.estimate === null ? null : t(report.estimate),
    empty: report.empty(snapshot) ? t(`${report.key}Empty`, { year }) : null,
    strong: report.strong,
    sheet: t(`${report.key}Sheet`, { year }),
    file: report.file(year, today),
  };
}
