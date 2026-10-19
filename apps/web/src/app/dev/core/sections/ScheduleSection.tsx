import { isoDate, type IsoDate } from '@esta/core/date';
import { formatDate, formatVnd, type Locale } from '@esta/core/format';
import { planInvoices } from '@esta/core/lease';
import { vnd } from '@esta/core/money';
import { generateSchedule, validateAmendment, type Amendment, type AmendmentRefusal, type LeaseTerms } from '@esta/core/schedule';
import { getLocale, getTranslations } from 'next-intl/server';

const d = isoDate;
const AS_OF = d('2026-10-07');

type Note = { kind: 'none' } | { kind: 'covered' } | { kind: 'prorated'; days: number; full: number };

type Line = { start: IsoDate; end: IsoDate; due: IsoDate; amountVnd: number; note: Note };

type Expected = readonly [start: string, end: string, due: string, amountVnd: number, note?: 'covered' | readonly [days: number, full: number]];

type ScheduleExample = {
  id: string;
  label: 'lse3' | 'phong3' | 'phong5' | 'quarterly' | 'escalation' | 'midEnd' | 'amendment' | 'annual' | 'thuDuc';
  lines: () => readonly Line[];
  expected: readonly Expected[];
  /** Amendment starts `validateAmendment` must refuse on these terms, as of 2026-10-07. */
  refusals?: { terms: LeaseTerms; cases: readonly { start: string; expected: AmendmentRefusal }[] };
};

const base: LeaseTerms = {
  startDate: d('2026-01-01'),
  endDate: null,
  rentVnd: vnd(10_000_000),
  billingCycleMonths: 1,
  periodAnchor: 'calendar_month',
  firstPeriodProration: 'none',
  dueOffsetDays: 0,
  escalation: { kind: 'none' },
  paidThroughDate: null,
};

const terms = (overrides: Partial<LeaseTerms>): LeaseTerms => ({ ...base, ...overrides });

/** SPEC LSE-3: start 2026-07-15, calendar anchor, paid through 2026-09-30, billed on 2026-10-07. */
const lse3 = terms({ startDate: d('2026-07-15'), paidThroughDate: d('2026-09-30') });
const rentTo12M: Amendment = { effectivePeriodStart: d('2026-12-01'), changes: { rentVnd: vnd(12_000_000) } };

/** Dĩ An rooms bill monthly from their own 25th (SPEC §9.3). */
const room = (start: string, rent: number) =>
  terms({ startDate: d(start), endDate: d('2027-06-24'), rentVnd: vnd(rent), periodAnchor: 'lease_start', firstPeriodProration: 'by_days' });

function scheduleLines(lease: LeaseTerms, amendments: readonly Amendment[], until: string, from = '0000-01-01'): Line[] {
  return generateSchedule(lease, amendments, d(until))
    .filter((period) => period.start >= from)
    .map((period) => ({
      start: period.start,
      end: period.end,
      due: period.dueDate,
      amountVnd: period.rentVnd,
      note: period.coveredByPaidThrough
        ? { kind: 'covered' }
        : period.prorated === null
          ? { kind: 'none' }
          : { kind: 'prorated', days: period.prorated.days, full: period.prorated.daysInFullPeriod },
    }));
}

const EXAMPLES: readonly ScheduleExample[] = [
  {
    id: 'lse3',
    label: 'lse3',
    lines: () =>
      planInvoices({ ...lse3, utilitiesMode: 'tenant_direct' }, [], AS_OF).map((invoice) => ({
        start: invoice.periodStart,
        end: invoice.periodEnd,
        due: invoice.dueDate,
        amountVnd: invoice.lines.reduce((sum, line) => sum + line.amountVnd, 0),
        note: { kind: 'none' },
      })),
    expected: [
      ['2026-10-01', '2026-10-31', '2026-10-01', 10_000_000],
      ['2026-11-01', '2026-11-30', '2026-11-01', 10_000_000],
    ],
  },
  {
    id: 'phong-3',
    label: 'phong3',
    lines: () => scheduleLines(room('2025-09-25', 2_500_000), [], '2026-10-25', '2026-09-25'),
    expected: [
      ['2026-09-25', '2026-10-24', '2026-09-25', 2_500_000],
      ['2026-10-25', '2026-11-24', '2026-10-25', 2_500_000],
    ],
  },
  {
    id: 'phong-5',
    label: 'phong5',
    lines: () => scheduleLines(room('2026-02-25', 2_800_000), [], '2026-10-25', '2026-09-25'),
    expected: [
      ['2026-09-25', '2026-10-24', '2026-09-25', 2_800_000],
      ['2026-10-25', '2026-11-24', '2026-10-25', 2_800_000],
    ],
  },
  {
    id: 'q7',
    label: 'quarterly',
    lines: () =>
      scheduleLines(
        terms({ startDate: d('2025-01-01'), endDate: d('2027-12-31'), rentVnd: vnd(15_000_000), billingCycleMonths: 3, paidThroughDate: d('2026-12-31') }),
        [],
        '2027-01-01',
      ),
    expected: [
      ['2025-01-01', '2025-03-31', '2025-01-01', 45_000_000, 'covered'],
      ['2025-04-01', '2025-06-30', '2025-04-01', 45_000_000, 'covered'],
      ['2025-07-01', '2025-09-30', '2025-07-01', 45_000_000, 'covered'],
      ['2025-10-01', '2025-12-31', '2025-10-01', 45_000_000, 'covered'],
      ['2026-01-01', '2026-03-31', '2026-01-01', 45_000_000, 'covered'],
      ['2026-04-01', '2026-06-30', '2026-04-01', 45_000_000, 'covered'],
      ['2026-07-01', '2026-09-30', '2026-07-01', 45_000_000, 'covered'],
      ['2026-10-01', '2026-12-31', '2026-10-01', 45_000_000, 'covered'],
      ['2027-01-01', '2027-03-31', '2027-01-01', 45_000_000],
    ],
  },
  {
    id: 'escalation',
    label: 'escalation',
    lines: () =>
      scheduleLines(
        terms({
          startDate: d('2025-01-01'),
          rentVnd: vnd(100_000_000),
          billingCycleMonths: 3,
          escalation: { kind: 'percent', valueBps: 500, everyMonths: 12, roundingVnd: vnd(100_000) },
        }),
        [],
        '2027-01-01',
      ),
    expected: [
      ['2025-01-01', '2025-03-31', '2025-01-01', 300_000_000],
      ['2025-04-01', '2025-06-30', '2025-04-01', 300_000_000],
      ['2025-07-01', '2025-09-30', '2025-07-01', 300_000_000],
      ['2025-10-01', '2025-12-31', '2025-10-01', 300_000_000],
      ['2026-01-01', '2026-03-31', '2026-01-01', 315_000_000],
      ['2026-04-01', '2026-06-30', '2026-04-01', 315_000_000],
      ['2026-07-01', '2026-09-30', '2026-07-01', 315_000_000],
      ['2026-10-01', '2026-12-31', '2026-10-01', 315_000_000],
      ['2027-01-01', '2027-03-31', '2027-01-01', 330_900_000],
    ],
  },
  {
    id: 'mid-end',
    label: 'midEnd',
    lines: () => scheduleLines(terms({ endDate: d('2026-11-07'), rentVnd: vnd(12_000_000) }), [], '2027-01-01', '2026-10-01'),
    expected: [
      ['2026-10-01', '2026-10-31', '2026-10-01', 12_000_000],
      ['2026-11-01', '2026-11-07', '2026-11-01', 2_800_000, [7, 30]],
    ],
  },
  {
    id: 'amendment',
    label: 'amendment',
    lines: () => scheduleLines(lse3, [rentTo12M], '2027-01-01', '2026-10-01'),
    expected: [
      ['2026-10-01', '2026-10-31', '2026-10-01', 10_000_000],
      ['2026-11-01', '2026-11-30', '2026-11-01', 10_000_000],
      ['2026-12-01', '2026-12-31', '2026-12-01', 12_000_000],
      ['2027-01-01', '2027-01-31', '2027-01-01', 12_000_000],
    ],
    refusals: {
      terms: lse3,
      cases: [
        { start: '2026-09-01', expected: 'not_after_as_of' },
        { start: '2026-12-15', expected: 'not_a_period_start' },
      ],
    },
  },
  {
    id: 'q1',
    label: 'annual',
    lines: () =>
      scheduleLines(
        terms({ startDate: d('2026-03-01'), endDate: d('2029-02-28'), rentVnd: vnd(30_000_000), billingCycleMonths: 12, paidThroughDate: d('2027-02-28') }),
        [],
        '2027-02-28',
      ),
    expected: [['2026-03-01', '2027-02-28', '2026-03-01', 360_000_000, 'covered']],
  },
  {
    id: 'thu-duc',
    label: 'thuDuc',
    lines: () =>
      scheduleLines(
        terms({ startDate: d('2025-11-01'), endDate: d('2026-11-01'), rentVnd: vnd(9_000_000), firstPeriodProration: 'by_days', paidThroughDate: d('2026-10-31') }),
        [],
        '2027-01-01',
        '2026-10-01',
      ),
    expected: [
      ['2026-10-01', '2026-10-31', '2026-10-01', 9_000_000, 'covered'],
      ['2026-11-01', '2026-11-01', '2026-11-01', 300_000, [1, 30]],
    ],
  },
];

function expectedLine([start, end, due, amountVnd, note]: Expected): Line {
  return {
    start: d(start),
    end: d(end),
    due: d(due),
    amountVnd,
    note: note === undefined ? { kind: 'none' } : note === 'covered' ? { kind: 'covered' } : { kind: 'prorated', days: note[0], full: note[1] },
  };
}

/** P3-08, moved from P3-02: each lease's periods from `generateSchedule` (or `planInvoices` for LSE-3) beside the expected ones. */
export async function ScheduleSection() {
  const [t, locale] = await Promise.all([getTranslations('devSchedule'), getLocale() as Promise<Locale>]);
  const note = (value: Note) => (value.kind === 'none' ? '' : value.kind === 'covered' ? t('covered') : t('prorated', { days: value.days, full: value.full }));
  const line = (value: Line | undefined) =>
    value === undefined
      ? t('noPeriod')
      : [t('span', { start: formatDate(value.start, locale), end: formatDate(value.end, locale) }), t('dueOn', { date: formatDate(value.due, locale) }), formatVnd(vnd(value.amountVnd), locale), note(value.note)]
          .filter(Boolean)
          .join(' · ');
  const result = (matches: boolean, expected: string) => (matches ? t('match') : t('mismatchExpected', { expected }));

  const rows = EXAMPLES.flatMap((example) => {
    const actual = example.lines();
    const expected = example.expected.map(expectedLine);
    const periods = Array.from({ length: Math.max(actual.length, expected.length) }, (_, i) => {
      const got = actual[i];
      const want = expected[i];
      const matches = line(got) === line(want);
      return {
        key: `${example.id}-${i}`,
        exampleId: example.id,
        matches,
        cells: [
          ['example', t(example.label)],
          ['period', got === undefined ? '' : t('span', { start: formatDate(got.start, locale), end: formatDate(got.end, locale) })],
          ['due', got === undefined ? '' : formatDate(got.due, locale)],
          ['amount', got === undefined ? '' : formatVnd(vnd(got.amountVnd), locale)],
          ['note', got === undefined ? t('noPeriod') : note(got.note)],
          ['result', result(matches, line(want))],
        ] as const,
      };
    });
    if (example.refusals === undefined) return periods;
    const { terms: amended, cases } = example.refusals;
    const refusals = cases.map((refusal, i) => {
      const checked = validateAmendment(amended, [], { effectivePeriodStart: d(refusal.start), changes: rentTo12M.changes }, AS_OF);
      const reason = checked.ok ? '' : checked.reason;
      const matches = reason === refusal.expected;
      return {
        key: `${example.id}-refusal-${i}`,
        exampleId: example.id,
        matches,
        cells: [
          ['example', t(example.label)],
          ['period', t('amendFrom', { date: formatDate(d(refusal.start), locale) })],
          ['due', ''],
          ['amount', ''],
          ['note', reason === '' ? t('accepted') : t('refused', { reason })],
          ['result', result(matches, t('refused', { reason: refusal.expected }))],
        ] as const,
      };
    });
    return [...periods, ...refusals];
  });

  const columns = [t('example'), t('period'), t('due'), t('amount'), t('note'), t('result')];
  return (
    <section aria-labelledby="schedule-heading" data-section="schedule" className="flex flex-col gap-4">
      <h2 id="schedule-heading" className="text-lead font-semibold">
        {t('title')}
      </h2>
      <p className="text-small text-ink-muted">{t('intro', { date: formatDate(AS_OF, locale) })}</p>
      <table className="w-full text-left text-small max-sm:block">
        <thead className="max-sm:sr-only">
          <tr className="border-b">
            {columns.map((column) => (
              <th key={column} scope="col" className="py-1 pr-4">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="tabular-nums max-sm:block">
          {rows.map((row) => (
            <tr
              key={row.key}
              data-example={row.exampleId}
              data-match={row.matches ? 'match' : 'mismatch'}
              className="border-b align-top max-sm:grid max-sm:grid-cols-[auto_1fr] max-sm:gap-x-3 max-sm:py-2"
            >
              {row.cells.map(([cell, value], i) => (
                <td key={cell} className={`py-1 pr-4 wrap-anywhere ${value === '' ? 'max-sm:hidden' : 'max-sm:contents'}`}>
                  <span aria-hidden="true" className="font-sans font-normal text-meta sm:hidden">
                    {columns[i]}
                  </span>
                  <span data-cell={cell}>{value}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
