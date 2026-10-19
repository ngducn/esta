import { isoDate, type IsoDate } from '@esta/core/date';
import { formatDate, formatVnd, type Locale } from '@esta/core/format';
import { vnd } from '@esta/core/money';
import { getLocale, getTranslations } from 'next-intl/server';

const d = isoDate;
const AS_OF = d('2026-10-07');

type Note = { kind: 'none' } | { kind: 'covered' } | { kind: 'prorated'; days: number; full: number };

type Line = { start: IsoDate; end: IsoDate; due: IsoDate; amountVnd: number; note: Note };

type Expected = readonly [start: string, end: string, due: string, amountVnd: number, note?: 'covered' | readonly [days: number, full: number]];

type ScheduleExample = {
  id: string;
  label: 'lse3' | 'phong3' | 'phong5' | 'quarterly' | 'escalation' | 'midEnd' | 'amendment' | 'annual' | 'thuDuc';
  expected: readonly Expected[];
};

const EXAMPLES: readonly ScheduleExample[] = [
  {
    id: 'lse3',
    label: 'lse3',
    expected: [
      ['2026-10-01', '2026-10-31', '2026-10-01', 10_000_000],
      ['2026-11-01', '2026-11-30', '2026-11-01', 10_000_000],
    ],
  },
  {
    id: 'phong-3',
    label: 'phong3',
    expected: [
      ['2026-09-25', '2026-10-24', '2026-09-25', 2_500_000],
      ['2026-10-25', '2026-11-24', '2026-10-25', 2_500_000],
    ],
  },
  {
    id: 'phong-5',
    label: 'phong5',
    expected: [
      ['2026-09-25', '2026-10-24', '2026-09-25', 2_800_000],
      ['2026-10-25', '2026-11-24', '2026-10-25', 2_800_000],
    ],
  },
  {
    id: 'q7',
    label: 'quarterly',
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
    expected: [
      ['2026-10-01', '2026-10-31', '2026-10-01', 12_000_000],
      ['2026-11-01', '2026-11-07', '2026-11-01', 2_800_000, [7, 30]],
    ],
  },
  {
    id: 'amendment',
    label: 'amendment',
    expected: [
      ['2026-10-01', '2026-10-31', '2026-10-01', 10_000_000],
      ['2026-11-01', '2026-11-30', '2026-11-01', 10_000_000],
      ['2026-12-01', '2026-12-31', '2026-12-01', 12_000_000],
      ['2027-01-01', '2027-01-31', '2027-01-01', 12_000_000],
    ],
  },
  {
    id: 'q1',
    label: 'annual',
    expected: [['2026-03-01', '2027-02-28', '2026-03-01', 360_000_000, 'covered']],
  },
  {
    id: 'thu-duc',
    label: 'thuDuc',
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

/**
 * The periods the database plans for each example lease, kept as fixtures: `supabase/tests/lease_schedule.test.sql`
 * proves the database plans exactly these.
 */
export async function ScheduleSection() {
  const [t, locale] = await Promise.all([getTranslations('devSchedule'), getLocale() as Promise<Locale>]);
  const note = (value: Note) => (value.kind === 'none' ? '' : value.kind === 'covered' ? t('covered') : t('prorated', { days: value.days, full: value.full }));
  const rows = EXAMPLES.flatMap((example) =>
    example.expected.map(expectedLine).map((line, i) => ({
      key: `${example.id}-${i}`,
      exampleId: example.id,
      cells: [
        ['example', t(example.label)],
        ['period', t('span', { start: formatDate(line.start, locale), end: formatDate(line.end, locale) })],
        ['due', formatDate(line.due, locale)],
        ['amount', formatVnd(vnd(line.amountVnd), locale)],
        ['note', note(line.note)],
      ] as const,
    })),
  );

  const columns = [t('example'), t('period'), t('due'), t('amount'), t('note')];
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
            <tr key={row.key} data-example={row.exampleId} className="border-b align-top max-sm:grid max-sm:grid-cols-[auto_1fr] max-sm:gap-x-3 max-sm:py-2">
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
