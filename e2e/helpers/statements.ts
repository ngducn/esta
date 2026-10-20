import { expect, type Page } from '@playwright/test';
import { z } from 'zod';
import { golden, householdStatement, roomingHouse, type HouseholdStatement, type OpenBill } from '../../fixtures/statements/household.ts';
import { isoDate } from '../../packages/core/src/date/iso-date.ts';
import { renderCsv, renderStatementGrid } from '../../packages/core/src/matching/render.ts';
import { UNRECOGNIZED_LAYOUT, UNRECOGNIZED_PREAMBLE } from '../../packages/core/src/matching/statement-scenario.ts';
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
  const { bills, balances } = await openBills(page, householdId);
  const rooms = new Map(balances.map((row) => [row.number, house.roomOfLease.get(row.lease_id) ?? '']));
  return { householdId, statement: householdStatement(bills, isoDate('2026-10-07')), bills, rooms };
}

/** A seeded lane's October statement, as `fixtures/statements/generate.ts` writes it, from what the lane owes now. */
export async function laneStatement(page: Page, lane: number, householdId: string): Promise<{ statement: HouseholdStatement; bills: readonly OpenBill[] }> {
  const { bills } = await openBills(page, householdId);
  return { statement: householdStatement(bills, isoDate('2026-10-07'), `FT${String(lane).padStart(2, '0')}`), bills };
}

/**
 * The account's next statement from the bank Esta does not recognize (P3-21): one transfer naming each bill still owed by
 * its code, under new bank references, with `header` in place of that bank's own labels when given.
 */
export function nextUnrecognizedCsv(bills: readonly OpenBill[], refPrefix: string, header?: readonly string[]): string {
  const rows = bills.map((bill, i) => ({ date: isoDate('2026-10-07'), amount: bill.outstanding, bankRef: `${refPrefix}${String(i + 1).padStart(6, '0')}`, description: `CK ESTA${bill.memoCode}` }));
  const [labels = [], ...lines] = renderStatementGrid(UNRECOGNIZED_LAYOUT, rows);
  return renderCsv([...UNRECOGNIZED_PREAMBLE, header ?? labels, ...lines]);
}

export async function openBills(page: Page, householdId: string) {
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
  return { bills, balances };
}

export const line = (page: Page, index: number) => page.locator(`[data-testid="statement-line"][data-line="${index}"]`);

/** The picker is enabled once React owns the page, so a file chosen earlier is never lost. */
export async function chooseFile(page: Page, name: string, buffer: Buffer | string) {
  await expect(page.getByTestId('statement-file')).toBeEnabled();
  await page.getByTestId('statement-file').setInputFiles({ name, mimeType: name.endsWith('.csv') ? 'text/csv' : 'application/octet-stream', buffer: Buffer.from(buffer) });
}

export async function upload(page: Page, name: string, buffer: Buffer | string) {
  await page.goto('/collections/import');
  await chooseFile(page, name, buffer);
  await expect(page.getByTestId('statement-read')).toBeVisible();
}

export async function preview(page: Page, name: string, buffer: Buffer | string) {
  await upload(page, name, buffer);
  await page.getByTestId('statement-preview').click();
  await expect(page).toHaveURL(/\/collections\/import\/[0-9a-f-]{36}$/, { timeout: 20_000 });
}

/** Every line reads the status golden.json gives it, and names the bills it gives. */
export async function expectGolden(page: Page, household: StatementHousehold) {
  for (const expected of golden(household.statement)) {
    const row = line(page, expected.index);
    await expect(row).toHaveAttribute('data-status', expected.status);
    for (const number of expected.invoices) await expect(row.getByTestId('statement-target')).toContainText(number);
  }
}

export const statementPayments = (page: Page, householdId: string) =>
  memberRest<{ amount_vnd: number; bank_account_id: string | null; statement_row_id: string | null }[]>(
    page,
    'GET',
    `payments?household_id=eq.${householdId}&source=eq.statement_import&select=amount_vnd,bank_account_id,statement_row_id`,
  );

/** A second receiving account for the household, which a statement can be imported into instead of the default. */
export async function secondAccount(page: Page, householdId: string): Promise<string> {
  const [account] = await memberRest<{ id: string }[]>(page, 'POST', 'bank_accounts', {
    household_id: householdId,
    bank_bin: '970403',
    account_no: '0011012345678',
    account_name: 'TRAN MINH DEMO',
  });
  if (account === undefined) throw new Error('No second account');
  return account.id;
}
