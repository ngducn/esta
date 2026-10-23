import { isoDate } from '@esta/core/date';
import { checkReportInvariants, holds, monthlyCollections, propertyPnl, rentRoll } from '@esta/core/reports';
import { readReportSnapshot } from '@esta/ops';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedId } from '../../../../../supabase/seed/generator/ids.ts';
import { memberClient } from '@/test/member-client';
import { signedInAs } from '@/test/stack';

const PERIOD = { from: isoDate('2025-10-01'), to: isoDate('2026-10-31'), asOf: isoDate('2026-10-07') };
const label = (text: string) => text;
const pnlLabels = { property: 'p', income: 'i', expenses: 'e', noi: 'n', total: 't' };
const rollLabels = { place: 'p', tenant: 't', rent: 'r', cycle: 'c', paidThrough: 'pt', nextDue: 'nd', deposit: 'd', endDate: 'e', total: 't', placeName: label, cycleMonths: String, date: label, none: '-', openEnded: 'o' };
const collectionLabels = { month: 'm', monthName: label, billed: 'b', collected: 'c', outstanding: 'o', total: 't' };

const READ_ONLY_LANES = [1, 2, 4];
const WRITTEN_LANE = 10;
const HOUSEHOLD = seedId(`seed:household:lane-${WRITTEN_LANE}`);
const { client, signIn } = memberClient(`ryan.lane${WRITTEN_LANE}@demo.esta.test`, HOUSEHOLD);
const { activateLease, createTenant, saveLease, terminateLease } = await import('@/server/actions/leases');
const created: string[] = [];

async function letTownhouseOwingOctober(): Promise<{ propertyId: string; leaseId: string }> {
  const code = `RPT${String(Date.now()).slice(-6)}${created.length}`;
  const property = await client.from('properties').insert({ household_id: HOUSEHOLD, nickname: `Nhà báo cáo Demo ${code}`, code, kind: 'townhouse', use_mode: 'rental' }).select('id').single();
  if (property.error) throw property.error;
  created.push(property.data.id);
  const unit = await client.from('units').select('id').eq('property_id', property.data.id).single();
  if (unit.error) throw unit.error;
  const tenant = await createTenant({ full_name: `Người thuê báo cáo Demo ${code}`, phone: '0903 000 111' });
  if (!tenant.ok) throw new Error(tenant.reason);
  const saved = await saveLease(property.data.id, null, {
    unit_id: unit.data.id,
    tenant_party_id: tenant.tenant.id,
    start_date: '2026-08-01',
    end_date: '2027-07-31',
    rent_vnd: 4_000_000,
    billing_cycle_months: 1,
    period_anchor: 'calendar_month',
    first_period_proration: 'none',
    deposit_vnd: null,
    escalation: { kind: 'none' },
    utilities_mode: 'tenant_direct',
    tax_payer: 'owner',
    notice_days: 30,
  });
  if (!saved.ok) throw new Error(saved.reason);
  const paidThrough = '30/09/2026';
  const activated = await activateLease(saved.id, paidThrough);
  if (!activated.ok) throw new Error(activated.reasons.join(', '));
  return { propertyId: property.data.id, leaseId: saved.id };
}

beforeAll(signIn);

afterAll(async () => {
  if (created.length > 0) await client.from('properties').update({ deleted_at: '2026-10-07T02:00:00Z' }).in('id', created);
});

describe('readReportSnapshot on the full seed (FIN-4)', () => {
  it.each(READ_ONLY_LANES)(
    'lane %i: every invariant holds for every month from 2025-10 to 2026-10 and every property',
    async (lane) => {
      const member = await signedInAs(`ryan.lane${lane}@demo.esta.test`);
      const household = seedId(`seed:household:lane-${lane}`);
      const snapshot = await readReportSnapshot(member, household, PERIOD);
      const checks = checkReportInvariants(snapshot, {
        pnl: propertyPnl(snapshot, pnlLabels),
        rentRoll: rentRoll(snapshot, rollLabels),
        collections: monthlyCollections(snapshot, collectionLabels),
      });
      expect(checks.filter((check) => !holds(check))).toEqual([]);
      expect(checks.filter((check) => check.kind === 'monthIncome')).toHaveLength(snapshot.properties.length * 13);

      const { data, error } = await member.from('allocation_facts').select('amount_vnd').eq('household_id', household).gte('received_on', PERIOD.from).lte('received_on', PERIOD.to);
      if (error) throw error;
      const received = data.reduce((sum, row) => sum + (row.amount_vnd ?? 0), 0);
      expect(received, 'the seed received rent in the period').toBeGreaterThan(0);
      expect(snapshot.incomes.reduce((sum, fact) => sum + fact.amountVnd, 0), 'the snapshot holds every allocation received in the period').toBe(received);
      expect(snapshot.leases.map((lease) => lease.unitLabel), 'Phòng 7 ended in the seed').not.toContain('Phòng 7');
    },
    30_000,
  );
});

describe('readReportSnapshot as leases end and properties go (FIN-4, SPEC §5.4)', () => {
  it('lists a lease terminated from 15/12/2026 with that end date, and leaves out one terminated on 01/10/2026', async () => {
    const later = await letTownhouseOwingOctober();
    const earlier = await letTownhouseOwingOctober();
    expect(await terminateLease(later.leaseId, { terminatedOn: '2026-12-15', reason: 'Người thuê Demo báo chuyển đi' })).toMatchObject({ ok: true });
    expect(await terminateLease(earlier.leaseId, { terminatedOn: '2026-10-01', reason: 'Người thuê Demo đã chuyển đi' })).toMatchObject({ ok: true });

    const roll = rentRoll(await readReportSnapshot(client, HOUSEHOLD, PERIOD), rollLabels);
    expect(roll.rows.find((row) => row.key === later.leaseId)?.cells.at(-1)?.value, 'the end date is the termination date').toBe('2026-12-15');
    expect(roll.rows.map((row) => row.key)).not.toContain(earlier.leaseId);
  }, 30_000);

  it("leaves a deleted property's unpaid bill out, so October's collections are collection_candidates' October bills", async () => {
    const gone = await letTownhouseOwingOctober();
    const before = await readReportSnapshot(client, HOUSEHOLD, PERIOD);
    expect(before.invoices.filter((invoice) => invoice.leaseId === gone.leaseId && invoice.outstandingVnd > 0), "October's bill is unpaid").toHaveLength(1);
    const deleted = await client.from('properties').update({ deleted_at: '2026-10-07T02:00:00Z' }).eq('id', gone.propertyId);
    if (deleted.error) throw deleted.error;

    const snapshot = await readReportSnapshot(client, HOUSEHOLD, PERIOD);
    expect(snapshot.invoices.filter((invoice) => invoice.leaseId === gone.leaseId)).toEqual([]);
    const { data, error } = await client.rpc('collection_candidates', { p_month: '2026-10-01' });
    if (error) throw error;
    const october = data.filter((bill) => bill.due_date >= '2026-10-01');
    const sum = (key: 'total_vnd' | 'allocated_vnd' | 'outstanding_vnd') => october.reduce((total, bill) => total + bill[key], 0);
    expect(october.map((bill) => bill.lease_id)).not.toContain(gone.leaseId);
    expect(monthlyCollections(snapshot, collectionLabels).rows.find((row) => row.key === '2026-10')?.cells.map((cell) => cell.value)).toEqual([
      '2026-10-01',
      sum('total_vnd'),
      sum('allocated_vnd'),
      sum('outstanding_vnd'),
    ]);
  }, 30_000);
});
