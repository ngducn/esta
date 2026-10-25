import { groupCollections, monthCollected } from '@esta/core/collections';
import { firstOfMonth } from '@esta/core/date/calendar';
import { formatBps, formatCount, formatDate, formatMonthYear, formatVnd } from '@esta/core/format';
import { estaUri } from '@esta/core/links';
import { holdsUnit } from '@esta/core/lease';
import { vnd } from '@esta/core/money';
import { portfolioValue } from '@esta/core/valuations';
import { z } from 'zod';
import { monthStart, type ReadToolContext } from './ask-reads';
import { sameAnswer } from './fact-sheet';
import { propertyByHandle } from './list-properties';
import { parseToolInput } from './server';

const inputSchema = z.strictObject({ year: z.number().int().min(2000).max(2100), month: z.number().int().min(1).max(12), property: z.string().optional() });
const USAGE = 'collections takes {"year", "month": 1 to 12, "property": a handle from list_properties, optional}';

/** `collections` (AGENT.md §4): the collections board for a month (SPEC LSE-10), one record per bill and one per status, and the board's `Đã thu X / Y`. */
export function collectionsTool({ reads, locale, asOf, cite, properties }: ReadToolContext) {
  return sameAnswer(async (raw: Record<string, unknown>) => {
    const { year, month, property } = parseToolInput(inputSchema, raw, USAGE);
    const scope = property === undefined ? null : propertyByHandle(properties, property);
    const start = monthStart(year, month);
    const rows = (await reads.collections(start)).filter((row) => scope === null || row.propertyId === scope.id);
    const groups = groupCollections(rows, start, asOf);
    const bills = groups.flatMap(({ items }) =>
      items.map(({ row, state, amountVnd, carriedFrom }) =>
        cite({
          property_label: row.propertyName,
          unit_label: row.wholeUnit ? row.propertyName : row.unitLabel,
          tenant_name: row.tenantName,
          status: state.group,
          days_overdue_display: state.group === 'overdue' ? formatCount(state.days, locale) : null,
          due_date_display: formatDate(row.dueDate, locale),
          amount_display: formatVnd(amountVnd, locale),
          carried_over: carriedFrom !== null,
          link: row.propertyArchived ? null : estaUri({ type: 'invoice', id: row.invoiceId }),
        }),
      ),
    );
    const totals = groups.map((group) => cite({ status: group.key, count_display: formatCount(group.items.length, locale), total_display: formatVnd(group.totalVnd, locale) }));
    const { collectedVnd, billedVnd } = monthCollected(groups);
    const month_collected = cite({ month_date_display: formatMonthYear(start, locale), collected_display: formatVnd(collectedVnd, locale), billed_display: formatVnd(billedVnd, locale) });
    return { bills, totals, month_collected };
  });
}

/** `portfolio_overview` (AGENT.md §4): the household at a glance on the Clock's date. */
export function portfolioOverviewTool({ reads, locale, asOf, cite }: ReadToolContext) {
  return sameAnswer(async () => {
    const month = firstOfMonth(asOf);
    const [report, rows, leases] = await Promise.all([reads.report(Number(asOf.slice(0, 4))), reads.collections(month), reads.leases()]);
    const leased = report.units.filter((unit) => report.tenancies.some((lease) => lease.unitId === unit.id && holdsUnit(lease, asOf))).length;
    const { collectedVnd, billedVnd } = monthCollected(groupCollections(rows, month, asOf));
    const value = portfolioValue(
      report.properties.map((property) => property.id),
      report.valuations,
      asOf,
    );
    return cite({
      property_count_display: formatCount(report.properties.length, locale),
      rental_unit_count_display: formatCount(report.units.length, locale),
      leased_unit_count_display: formatCount(leased, locale),
      occupancy_display: report.units.length === 0 ? null : formatBps(Math.round((leased * 10_000) / report.units.length), locale),
      month_date_display: formatMonthYear(month, locale),
      billed_this_month_display: formatVnd(billedVnd, locale),
      collected_this_month_display: formatVnd(collectedVnd, locale),
      deposits_held_display: formatVnd(vnd(leases.reduce((sum, lease) => (lease.property_archived || lease.status === 'draft' ? sum : sum + lease.held_deposit_vnd), 0)), locale),
      estimated_value_display: value === null ? null : formatVnd(value.totalVnd, locale),
      oldest_valuation_date_display: value === null ? null : formatDate(value.oldestAsOf, locale),
      unvalued_property_count_display: value === null ? null : formatCount(value.unvaluedCount, locale),
    });
  });
}
