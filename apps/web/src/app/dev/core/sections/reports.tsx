import { addDays, addMonths, firstOfMonth } from '@esta/core/date/calendar';
import { formatVnd, type Locale } from '@esta/core/format';
import { vnd } from '@esta/core/money';
import { checkReportInvariants, holds, type InvariantCheck } from '@esta/core/reports';
import { readReportSnapshot } from '@esta/ops';
import { getLocale, getTranslations } from 'next-intl/server';
import { getClock } from '@/server/clock';
import { getCurrentMember } from '@/server/member';
import { REPORTS } from '@/server/reports/load';
import { createSessionClient } from '@/server/supabase/server';

type MonthIncome = Extract<InvariantCheck, { kind: 'monthIncome' }>;

/** FIN-4 on the signed-in household: the last 13 months of P&L income against `allocation_facts`, every totals row, and the owner shares. */
export async function ReportsSection() {
  const member = await getCurrentMember();
  const heading = (
    <h2 id="reports-heading" className="text-lead font-semibold">
      Report invariants (FIN-4)
    </h2>
  );
  if (member === null) {
    return (
      <section aria-labelledby="reports-heading" data-section="reports" id="reports" className="flex flex-col gap-2">
        {heading}
        <p className="text-small text-ink-muted">Sign in to check a household.</p>
      </section>
    );
  }
  const [clock, t, place, valuations, locale] = await Promise.all([
    getClock(),
    getTranslations('reports'),
    getTranslations('collections'),
    getTranslations('valuations'),
    getLocale() as Promise<Locale>,
  ]);
  const today = clock.today();
  const period = { from: addMonths(firstOfMonth(today), -12), to: addDays(addMonths(firstOfMonth(today), 1), -1) };
  const snapshot = await readReportSnapshot(await createSessionClient(), member.household.id, { ...period, asOf: today });
  const messages = { t, place, valuations, locale };
  const checks = checkReportInvariants(snapshot, {
    pnl: REPORTS.pnl.build(snapshot, messages),
    rentRoll: REPORTS['rent-roll'].build(snapshot, messages),
    collections: REPORTS.collections.build(snapshot, messages),
    occupancy: REPORTS.occupancy.build(snapshot, messages),
    portfolio: REPORTS.portfolio.build(snapshot, messages),
    owners: REPORTS.owners.build(snapshot, messages),
  });
  const months = new Map<string, MonthIncome[]>();
  for (const check of checks) if (check.kind === 'monthIncome') months.set(check.month, [...(months.get(check.month) ?? []), check]);
  const sum = (values: readonly number[]) => formatVnd(vnd(values.reduce((total, value) => total + value, 0)), locale);
  const others = checks.filter((check) => check.kind !== 'monthIncome');

  return (
    <section aria-labelledby="reports-heading" data-section="reports" id="reports" className="flex flex-col gap-4">
      {heading}
      <p data-testid="reports-summary" className="text-small">
        {checks.length} checks from {period.from} to {period.to}, {checks.filter((check) => !holds(check)).length} failing
      </p>
      <table className="w-full text-left text-small">
        <thead>
          <tr className="border-b">
            <th className="py-1">Month</th>
            <th className="py-1 text-end">allocation_facts</th>
            <th className="py-1 text-end">P&amp;L income</th>
            <th className="py-1">Result</th>
          </tr>
        </thead>
        <tbody>
          {[...months].map(([month, rows]) => {
            const ok = rows.every(holds);
            return (
              <tr key={month} data-testid="reports-month" data-month={month.slice(0, 7)} data-matches={ok} className="border-b align-top">
                <td className="py-1">{month.slice(0, 7)}</td>
                <td className="py-1 text-end figures">{sum(rows.map((row) => row.expectedVnd))}</td>
                <td className="py-1 text-end figures">{sum(rows.map((row) => row.reportedVnd))}</td>
                <td className="py-1">{ok ? `pass, ${rows.length} properties` : `FAIL on ${rows.filter((row) => !holds(row)).map((row) => row.propertyId).join(', ')}`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <ul className="flex flex-col gap-1 text-small">
        {others.map((check) => {
          const [key, name, reported, expected] =
            check.kind === 'totals'
              ? [`${check.report}.${check.column}`, `${check.report} totals ${check.column}`, check.reported, check.expected]
              : check.kind === 'ownerSplit'
                ? [`owners.${check.column}`, `owner shares of P&L ${check.column}`, check.reportedVnd, check.expectedVnd]
                : [check.propertyId, `P&L row ${check.propertyId}`, check.reportedVnd, check.expectedVnd];
          return (
            <li key={key} data-testid="reports-check" data-matches={holds(check)}>
              {name}: {holds(check) ? 'pass' : `FAIL, ${reported} against ${expected}`}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
