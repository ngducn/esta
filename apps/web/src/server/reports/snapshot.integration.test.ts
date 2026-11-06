import { isoDate } from '@esta/core/date';
import { monthCollected } from '@esta/core/collections';
import { billsDueIn, checkReportInvariants, holds, monthlyCollections, occupancy, ownerSummary, portfolioSummary, propertyPnl, rentRoll, yearPeriod } from '@esta/core/reports';
import { formatVnd } from '@esta/core/format';
import { vnd } from '@esta/core/money';
import { computeTaxPosition } from '@esta/core/tax';
import { readMonthCollected, readReportSnapshot, readTaxInputs } from '@esta/ops';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { integrationLane } from '@/test/lanes';
import { memberClient } from '@/test/member-client';
import { signedInAs } from '@/test/stack';

const PERIOD = { from: isoDate('2025-10-01'), to: isoDate('2026-10-31'), asOf: isoDate('2026-10-07') };
const label = (text: string) => text;
const pnlLabels = { property: 'p', income: 'i', expenses: 'e', noi: 'n', total: 't', archived: 'a' };
const rollLabels = { place: 'p', tenant: 't', rent: 'r', cycle: 'c', paidThrough: 'pt', nextDue: 'nd', deposit: 'd', endDate: 'e', total: 't', placeName: label, cycleMonths: String, date: label, none: '-', openEnded: 'o' };
const collectionLabels = { month: 'm', monthName: label, billed: 'b', collected: 'c', outstanding: 'o', total: 't' };
const occupancyLabels = { place: 'p', occupied: 'o', vacant: 'v', rate: 'r', vacantFor: 'f', total: 't', placeName: label, percent: String, leased: 'leased', none: '-' };
const portfolioLabels = { property: 'p', value: 'v', valuedOn: 'd', annualRent: 'a', yield: 'y', total: 't', dated: label, percent: String, noValuation: 'none', noLease: 'no lease' };
const ownerLabels = { owner: 'o', revenue: 'r', income: 'i', expenses: 'e', vat: 'v', pit: 'p', total: 't', unattributed: 'u', noRule: 'n' };
const YEAR = { ...yearPeriod(2026, PERIOD.asOf), asOf: PERIOD.asOf };
const cell = (table: { rows: readonly { key: string; cells: readonly { value: unknown }[] }[] }, key: string, index: number) => table.rows.find((row) => row.key === key)?.cells[index]?.value;

const READ = integrationLane(import.meta.url, 0);
const { household: HOUSEHOLD, ryan } = integrationLane(import.meta.url, 1);
const { client, signIn } = memberClient(ryan, HOUSEHOLD);
const { activateLease, createTenant, saveLease, terminateLease } = await import('@/server/actions/leases');
const { recordPayment } = await import('@/server/actions/payments');
const { ledgerTool } = await import('../../../../agent/src/tools/ledger');
const { runSheet } = await import('../../../../agent/src/tools/fact-sheet');
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
  it(
    'every invariant holds for every month from 2025-10 to 2026-10 and every property',
    async () => {
      const member = await signedInAs(READ.ryan);
      const { household } = READ;
      const snapshot = await readReportSnapshot(member, household, PERIOD);
      const checks = checkReportInvariants(snapshot, {
        pnl: propertyPnl(snapshot, pnlLabels),
        rentRoll: rentRoll(snapshot, rollLabels),
        collections: monthlyCollections(snapshot, collectionLabels),
        occupancy: occupancy(snapshot, occupancyLabels),
        portfolio: portfolioSummary(snapshot, portfolioLabels),
        owners: ownerSummary(snapshot, ownerLabels),
      });
      expect(checks.filter((check) => check.kind === 'ownerSplit'), "the owners' shares add up to the P&L").toHaveLength(2);
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

describe('occupancy, the portfolio and the owner summary on the full seed (FIN-4, FIN-5)', () => {
  it(
    'Kho Biên Hòa has stood empty 70 days and Dĩ An Phòng 8 67, and each owner has their tax card revenue',
    async () => {
      const member = await signedInAs(READ.ryan);
      const { household } = READ;
      const snapshot = await readReportSnapshot(member, household, YEAR);
      const table = occupancy(snapshot, occupancyLabels);
      const unit = (property: string, unitLabel: string) => snapshot.units.find((candidate) => candidate.propertyName.includes(property) && candidate.label === unitLabel)?.id ?? '';
      const bienHoa = snapshot.units.find((candidate) => candidate.propertyName.includes('Biên Hòa'))?.id ?? '';
      expect(cell(table, bienHoa, 4), 'W4: 70 days since 2026-07-29').toBe(70);
      expect(cell(table, unit('Dĩ An', 'Phòng 8'), 4), 'W4: 67 days since available_from 2026-08-01').toBe(67);
      expect(cell(table, unit('Dĩ An', 'Phòng 7'), 4), 'Phòng 7 ended 2026-09-15').toBe(22);

      const owners = ownerSummary(snapshot, ownerLabels);
      expect(snapshot.owners.length, 'the seed has two owners').toBeGreaterThanOrEqual(2);
      for (const owner of snapshot.owners) {
        const inputs = await readTaxInputs(member, household, { partyId: owner.id, year: 2026, asOf: PERIOD.asOf });
        if (inputs.kind !== 'rule') throw new Error('expected the 2026 rule');
        expect(cell(owners, owner.id, 1), owner.name).toBe(computeTaxPosition(inputs).projectedVnd);
      }
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

    const snapshot = await readReportSnapshot(client, HOUSEHOLD, PERIOD);
    const roll = rentRoll(snapshot, rollLabels);
    expect(roll.rows.find((row) => row.key === later.leaseId)?.cells.at(-1)?.value, 'the end date is the termination date').toBe('2026-12-15');
    expect(roll.rows.map((row) => row.key)).not.toContain(earlier.leaseId);

    const year = await readReportSnapshot(client, HOUSEHOLD, YEAR);
    const unitOf = (propertyId: string) => year.units.find((unit) => unit.propertyId === propertyId)?.id ?? '';
    const rooms = occupancy(year, occupancyLabels);
    expect(rooms.rows.find((row) => row.key === unitOf(later.propertyId))?.cells.slice(1).map((one) => one.value), 'let from 01/08 and still let until 15/12').toEqual([68, 0, '10000', 'leased']);
    expect(rooms.rows.find((row) => row.key === unitOf(earlier.propertyId))?.cells.slice(1).map((one) => one.value), 'let from 01/08 to 01/10, empty since').toEqual([62, 6, String(Math.round((62 * 10_000) / 68)), 6]);
    expect(cell(portfolioSummary(year, portfolioLabels), later.propertyId, 3), "a later termination still owes this year's rent").toBe(48_000_000);
  }, 30_000);

  it("shows the same billed, collected and still-owed figures for October on every screen before and after its property is archived, and the database agrees", async () => {
    const gone = await letTownhouseOwingOctober();
    const owed = (await readReportSnapshot(client, HOUSEHOLD, PERIOD)).invoices.find((invoice) => invoice.leaseId === gone.leaseId && invoice.outstandingVnd > 0);
    if (owed === undefined) throw new Error("October's bill is unpaid");
    const paid = await recordPayment({ invoiceId: owed.id, owedVnd: owed.outstandingVnd, amount: '4.000.000', method: 'bank_transfer', receivedOn: '07/10/2026', idempotencyKey: crypto.randomUUID(), invoiceIds: null });
    expect(paid.ok).toBe(true);
    const spent = await client.from('expenses').insert({ household_id: HOUSEHOLD, property_id: gone.propertyId, category: 'repair', amount_vnd: 1_250_000, paid_on: '2026-10-05' });
    if (spent.error) throw spent.error;

    const october = isoDate('2026-10-01');
    const askHouseholdYear = async () => {
      const { cite } = runSheet();
      const answer = await ledgerTool(client, HOUSEHOLD, 'vi', new Map(), cite, isoDate('2026-10-07'))({ year: 2026 });
      return [answer.ledger.income_display, answer.ledger.expenses_display, answer.ledger.net_display];
    };
    const read = async () => {
      const snapshot = await readReportSnapshot(client, HOUSEHOLD, PERIOD);
      const row = monthlyCollections(snapshot, collectionLabels).rows.find((one) => one.key === '2026-10');
      const [, billed, collected, outstanding] = row?.cells.map((one) => Number(one.value)) ?? [];
      const year = await readReportSnapshot(client, HOUSEHOLD, YEAR);
      return {
        report: { billedVnd: billed, collectedVnd: collected, outstandingVnd: outstanding },
        home: await readMonthCollected(client, HOUSEHOLD, october),
        ask: monthCollected(billsDueIn(snapshot.invoices, october)),
        pnl: propertyPnl(year, pnlLabels).totals.cells.slice(1).map((one) => one.value),
        owners: ownerSummary(year, ownerLabels).totals.cells.slice(2, 4).map((one) => one.value),
        askLedger: await askHouseholdYear(),
      };
    };
    const inSql = async () => {
      const bills = await client.from('invoice_balances').select('total_vnd, allocated_vnd, outstanding_vnd').eq('household_id', HOUSEHOLD).eq('status', 'issued').gte('due_date', '2026-10-01').lte('due_date', '2026-10-31');
      if (bills.error) throw bills.error;
      const facts = await client.from('allocation_facts').select('amount_vnd').eq('household_id', HOUSEHOLD).gte('received_on', YEAR.from).lte('received_on', YEAR.to);
      if (facts.error) throw facts.error;
      const paidOut = await client.from('expenses').select('amount_vnd').eq('household_id', HOUSEHOLD).is('deleted_at', null).gte('paid_on', YEAR.from).lte('paid_on', YEAR.to);
      if (paidOut.error) throw paidOut.error;
      const sum = (values: (number | null)[]) => values.reduce<number>((total, value) => total + (value ?? 0), 0);
      return {
        spent: sum(paidOut.data.map((expense) => expense.amount_vnd)),
        billedVnd: sum(bills.data.map((bill) => bill.total_vnd)),
        collectedVnd: sum(bills.data.map((bill) => Math.min(bill.allocated_vnd ?? 0, bill.total_vnd ?? 0))),
        outstandingVnd: sum(bills.data.map((bill) => bill.outstanding_vnd)),
        received: sum(facts.data.map((fact) => fact.amount_vnd)),
      };
    };
    const agree = (screens: Awaited<ReturnType<typeof read>>, sql: Awaited<ReturnType<typeof inSql>>) => {
      const figures = { billedVnd: sql.billedVnd, collectedVnd: sql.collectedVnd };
      expect(screens.report, 'Báo cáo').toEqual({ ...figures, outstandingVnd: sql.outstandingVnd });
      expect(screens.home, 'Tổng quan and Thu tiền').toEqual(figures);
      expect(screens.ask, 'Hỏi').toEqual(figures);
      expect(screens.pnl, 'Lãi lỗ: Thu, Tổng chi, Còn lại').toEqual([sql.received, sql.spent, sql.received - sql.spent]);
      const dong = (value: number) => formatVnd(vnd(value), 'vi');
      expect(screens.askLedger, "Hỏi's ledger tool, whole household").toEqual([dong(sql.received), dong(sql.spent), dong(sql.received - sql.spent)]);
      expect(screens.owners, 'the owner summary: income and expenses').toEqual([sql.received, sql.spent]);
    };
    const before = { screens: await read(), sql: await inSql() };
    agree(before.screens, before.sql);

    const archived = await client.from('properties').update({ deleted_at: '2026-10-07T02:00:00Z' }).eq('id', gone.propertyId);
    if (archived.error) throw archived.error;
    const after = { screens: await read(), sql: await inSql() };
    expect(after, 'archiving changes no figure').toEqual(before);
    agree(after.screens, after.sql);
  }, 60_000);

  it("counts a deleted property's unpaid bill in October's collections, as the board does, and leaves its rooms out of occupancy", async () => {
    const gone = await letTownhouseOwingOctober();
    const before = await readReportSnapshot(client, HOUSEHOLD, PERIOD);
    const owed = before.invoices.filter((invoice) => invoice.leaseId === gone.leaseId && invoice.outstandingVnd > 0);
    expect(owed, "October's bill is unpaid").toHaveLength(1);
    const deleted = await client.from('properties').update({ deleted_at: '2026-10-07T02:00:00Z' }).eq('id', gone.propertyId);
    if (deleted.error) throw deleted.error;

    const snapshot = await readReportSnapshot(client, HOUSEHOLD, PERIOD);
    expect(snapshot.invoices.filter((invoice) => invoice.leaseId === gone.leaseId), 'the owed bill stays').toEqual(owed);
    expect(snapshot.units.map((unit) => unit.propertyId), "a deleted property's rooms leave occupancy").not.toContain(gone.propertyId);
    expect(portfolioSummary(snapshot, portfolioLabels).rows.map((row) => row.key), 'and the portfolio').not.toContain(gone.propertyId);
    const { data, error } = await client.rpc('collection_candidates', { p_month: '2026-10-01' });
    if (error) throw error;
    expect(data.filter((bill) => bill.lease_id === gone.leaseId).map((bill) => bill.outstanding_vnd), 'the board lists it').toEqual(owed.map((invoice) => invoice.outstandingVnd));
    const bills = await client.from('invoice_balances').select('total_vnd, allocated_vnd, outstanding_vnd').eq('household_id', HOUSEHOLD).eq('status', 'issued').gte('due_date', '2026-10-01').lte('due_date', '2026-10-31');
    if (bills.error) throw bills.error;
    const sum = (key: 'total_vnd' | 'allocated_vnd' | 'outstanding_vnd') => bills.data.reduce((total, bill) => total + (bill[key] ?? 0), 0);
    const row = monthlyCollections(snapshot, collectionLabels).rows.find((one) => one.key === '2026-10');
    expect(row?.cells.map((one) => one.value), 'the report is the database, bill for bill').toEqual(['2026-10-01', sum('total_vnd'), sum('allocated_vnd'), sum('outstanding_vnd')]);
    const without = monthlyCollections({ ...snapshot, invoices: snapshot.invoices.filter((invoice) => invoice.leaseId !== gone.leaseId) }, collectionLabels).rows.find((one) => one.key === '2026-10');
    expect(row?.cells[3]?.value, "the deleted property's bill is in the owed total").toBe(Number(without?.cells[3]?.value) + owed.reduce((total, invoice) => total + invoice.outstandingVnd, 0));
  }, 30_000);
});
