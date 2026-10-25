import { groupCollections, monthCollected } from '@esta/core/collections';
import { isoDate } from '@esta/core/date';
import { formatVnd } from '@esta/core/format';
import { vnd } from '@esta/core/money';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fakeDb } from '../../src/test/fake-db';
import type { AskReads } from '../../src/tools/ask-reads';
import { collectionsTool, portfolioOverviewTool } from '../../src/tools/collections';
import { runSheet } from '../../src/tools/fact-sheet';
import { listLeasesTool } from '../../src/tools/leases';
import { listPropertiesTool } from '../../src/tools/list-properties';
import { getPropertyTool, propertyMetricsTool } from '../../src/tools/property-facts';
import { askTables, withDraftAndArchivedLeases } from '../ask-seed';
import { HOUSEHOLD } from '../full-seed';
import { ASK_READS_FIXTURE, replayedReads } from '../golden/ask-reads';

const ASOF = isoDate('2026-10-07');
const RECORDED = JSON.parse(readFileSync(ASK_READS_FIXTURE, 'utf8')) as Record<string, unknown>;
const truth = JSON.parse(readFileSync(new URL('../golden/ask-ground-truth.json', import.meta.url), 'utf8')) as Array<{ question: string; figure: string; value: string }>;
const fact = (question: string, figure: string) => truth.find((row) => row.question === question && row.figure === figure)?.value ?? '';

async function tools(reads: AskReads = replayedReads(withDraftAndArchivedLeases(RECORDED))) {
  const { cite } = runSheet();
  const properties = listPropertiesTool(fakeDb(askTables('')), HOUSEHOLD, cite);
  await properties.run();
  const context = { reads, locale: 'vi' as const, asOf: ASOF, cite, properties: properties.records };
  return { context, handle: (label: string) => [...properties.records.values()].find((property) => property.property_label === label)?.handle ?? '' };
}

describe('the household reads count what the screens count (AGENT.md §4)', () => {
  it('lists no draft and no lease of an archived property among the leases ending soon', async () => {
    const { context } = await tools();
    const { leases } = await listLeasesTool(context)({ ends_within_days: 60 });
    expect(leases.map((lease) => [lease.property_label, lease.status])).toEqual([[fact('q3', 'leases ending within 60 days'), 'active']]);
  });

  it('holds no draft deposit and no deposit of an archived property in the deposits total', async () => {
    const { context } = await tools();
    const overview = await portfolioOverviewTool(context)();
    expect(overview.deposits_held_display).toBe(formatVnd(vnd(Number(fact('q4', 'deposits held'))), 'vi'));
  });

  it("states the month's collected and billed amounts as the board's Đã thu X / Y, each payment capped at its bill", async () => {
    const recorded = RECORDED['collections["2026-10-01"]'] as Array<Record<string, unknown>>;
    const overpaid = { ...recorded[0], invoiceId: '00000000-0000-4000-8000-0000000a7c31', dueDate: '2026-10-05', totalVnd: 1_000_000, allocatedVnd: 1_500_000, outstandingVnd: 0, paymentStatus: 'paid' };
    const rows = [...recorded, overpaid];
    const { context } = await tools({ ...replayedReads(RECORDED), collections: async () => rows as never });
    const board = monthCollected(groupCollections(rows as never, isoDate('2026-10-01'), ASOF));
    const answer = await collectionsTool(context)({ year: 2026, month: 10 });
    expect(answer.month_collected).toMatchObject({ month_date_display: '10/2026', collected_display: formatVnd(board.collectedVnd, 'vi'), billed_display: formatVnd(board.billedVnd, 'vi') });
    expect(answer.totals.find((total) => total.status === 'paid')?.total_display).not.toBe(answer.month_collected.collected_display);
  });

  it("dates an empty property from its Trống từ pill, the day after its last lease ended", async () => {
    const { context, handle } = await tools();
    const metrics = await propertyMetricsTool(context)({ property: handle('Kho Biên Hòa'), year: 2026 });
    expect(metrics.property.empty_since_date_display).toBe('30/07/2026');
    expect(metrics.units.map((unit) => unit.empty_days_display)).toEqual([fact('q6', 'bien-hoa days empty')]);
  });

  it('links a certificate to its property’s Pháp lý tab', async () => {
    const { context, handle } = await tools();
    const { certificates } = await getPropertyTool(context)({ property: handle('Đất Bảo Lộc') });
    expect(certificates.map((certificate) => certificate.link)).toEqual([expect.stringMatching(/^esta:\/\/legal\/62d33252-02ba-5610-bd9a-12474774014c$/)]);
  });
});
