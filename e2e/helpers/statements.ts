import type { Page } from '@playwright/test';
import { z } from 'zod';
import { householdStatement, roomingHouse, type HouseholdStatement, type OpenBill } from '../../fixtures/statements/household.ts';
import { isoDate } from '../../packages/core/src/date/iso-date.ts';
import { vnd } from '../../packages/core/src/money/vnd.ts';
import { memberRest } from './auth-api';

export const PROPERTY = 'Dãy trọ Demo Sao Kê';
const TENANTS = ['Nguyễn Văn An Demo', 'Trần Thị Bình Demo', 'Lê Văn Cường Demo', 'Võ Thị Dung Demo', 'Hoàng Văn Em Demo', 'Đặng Thị Giang Demo'];

/** `rooms` names each owed bill's room by its number. */
export type StatementHousehold = {
  readonly householdId: string;
  readonly statement: HouseholdStatement;
  readonly bills: readonly OpenBill[];
  readonly rooms: ReadonlyMap<string, string>;
};

const balancesSchema = z.array(z.object({ id: z.string(), number: z.string(), lease_id: z.string(), due_date: z.string(), outstanding_vnd: z.number() }));
const codesSchema = z.array(z.object({ id: z.string(), memo_code: z.string(), lease: z.object({ tenant: z.object({ full_name: z.string() }) }) }));

/**
 * The signed-in admin's new household gets a receiving account and the fixture's Demo rooming house, and the statement
 * for what it owes. Each rule runs in its own household, because posting payments would change a seeded lane other
 * specs read.
 */
export async function statementHousehold(page: Page): Promise<StatementHousehold> {
  const [household] = await memberRest<{ id: string }[]>(page, 'GET', 'households?select=id');
  if (household === undefined) throw new Error('The new member has no household');
  const householdId = household.id;
  const house = roomingHouse(householdId, PROPERTY, 'SK', TENANTS);
  await memberRest(page, 'POST', 'bank_accounts', { household_id: householdId, bank_bin: '970436', account_no: '0123456789', account_name: 'NGUYEN THI DEMO', is_default: true });
  await memberRest(page, 'POST', 'properties', house.property);
  await memberRest(page, 'POST', 'units', house.units);
  await memberRest(page, 'POST', 'parties', house.parties);
  await memberRest(page, 'POST', 'leases', house.leases);
  for (const activation of house.activations) await memberRest(page, 'POST', 'rpc/activate_lease', activation);
  const balances = balancesSchema.parse(
    await memberRest(page, 'GET', `invoice_balances?household_id=eq.${householdId}&status=eq.issued&outstanding_vnd=gt.0&select=id,number,lease_id,due_date,outstanding_vnd`),
  );
  const codes = codesSchema.parse(
    await memberRest(
      page,
      'GET',
      `invoices?household_id=eq.${householdId}&select=id,memo_code,lease:leases!invoices_household_id_lease_id_fkey(tenant:parties!leases_household_id_tenant_party_id_fkey(full_name))`,
    ),
  );
  const bills = balances.map((row): OpenBill => {
    const code = codes.find((candidate) => candidate.id === row.id);
    if (code === undefined) throw new Error(`No memo code for ${row.number}`);
    return { id: row.id, number: row.number, memoCode: code.memo_code, tenantName: code.lease.tenant.full_name, dueDate: isoDate(row.due_date), outstanding: vnd(row.outstanding_vnd) };
  });
  const rooms = new Map(balances.map((row) => [row.number, house.roomOfLease.get(row.lease_id) ?? '']));
  return { householdId, statement: householdStatement(bills, isoDate('2026-10-07')), bills, rooms };
}
