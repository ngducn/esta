import { isoDate } from '@esta/core/date';
import { checkReportInvariants, holds, monthlyCollections, propertyPnl, rentRoll } from '@esta/core/reports';
import { readReportSnapshot } from '@esta/ops';
import { describe, expect, it } from 'vitest';
import { seedId } from '../../../../../supabase/seed/generator/ids.ts';
import { signedInAs } from '@/test/stack';

// `pnpm test:integration` (scripts/web-integration.ts) passes the slot's stack; run against a fresh `pnpm db:reset`.
// Reads only.

const PERIOD = { from: isoDate('2025-10-01'), to: isoDate('2026-10-31'), asOf: isoDate('2026-10-07') };
const label = (text: string) => text;
const pnlLabels = { property: 'p', income: 'i', expenses: 'e', noi: 'n', total: 't' };
const rollLabels = { place: 'p', tenant: 't', rent: 'r', cycle: 'c', paidThrough: 'pt', nextDue: 'nd', deposit: 'd', endDate: 'e', total: 't', placeName: label, cycleMonths: String, date: label, none: '-', openEnded: 'o' };
const collectionLabels = { month: 'm', monthName: label, billed: 'b', collected: 'c', outstanding: 'o', total: 't' };

describe('readReportSnapshot on the full seed (FIN-4)', () => {
  it.each(Array.from({ length: 10 }, (_, index) => index + 1))(
    'lane %i: every invariant holds for every month from 2025-10 to 2026-10 and every property',
    async (lane) => {
      const client = await signedInAs(`ryan.lane${lane}@demo.esta.test`);
      const household = seedId(`seed:household:lane-${lane}`);
      const snapshot = await readReportSnapshot(client, household, PERIOD);
      const checks = checkReportInvariants(snapshot, {
        pnl: propertyPnl(snapshot, pnlLabels),
        rentRoll: rentRoll(snapshot, rollLabels),
        collections: monthlyCollections(snapshot, collectionLabels),
      });
      expect(checks.filter((check) => !holds(check))).toEqual([]);
      expect(checks.filter((check) => check.kind === 'monthIncome')).toHaveLength(snapshot.properties.length * 13);

      const { data, error } = await client.from('allocation_facts').select('amount_vnd').eq('household_id', household).gte('received_on', PERIOD.from).lte('received_on', PERIOD.to);
      if (error) throw error;
      const received = data.reduce((sum, row) => sum + (row.amount_vnd ?? 0), 0);
      expect(received, 'the seed received rent in the period').toBeGreaterThan(0);
      expect(snapshot.incomes.reduce((sum, fact) => sum + fact.amountVnd, 0), 'the snapshot holds every allocation received in the period').toBe(received);
      expect(snapshot.leases.map((lease) => lease.unitLabel), 'Phòng 7 ended in the seed').not.toContain('Phòng 7');
    },
    30_000,
  );
});
