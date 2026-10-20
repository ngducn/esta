import { isoDate } from '@esta/core/date';
import { matchRows, type DecodedStatement } from '@esta/core/matching';
import { vnd } from '@esta/core/money';
import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { golden, householdStatement, roomingHouse, statementCsv, statementXlsx, unrecognizedCsv, type HouseholdStatement, type OpenBill } from '../../../../../fixtures/statements/household.ts';
import { UNRECOGNIZED_COLUMNS } from '../../../../../packages/core/src/matching/statement-scenario';
import { seedId } from '../../../../../supabase/seed/generator/ids';
import { decodeStatementFile, fileColumns, headerCells, pickedHeader, picksOf, type StatementFile } from '@/lib/statements/decodeStatementFile';
import { memberClient } from '@/test/member-client';

// `pnpm test:integration` (scripts/web-integration.ts) sets the slot's database clock to 2026-10-07. The file adds its
// own Demo rooming house to lane 8, whose six leases owe October, and imports the statement
// fixtures/statements/household.ts writes for those bills in each of the three layouts, and as layout D, a bank Esta
// does not recognize, read under the columns a person picks (P3-21).
const HOUSEHOLD = seedId('seed:household:lane-8');
const ACCOUNT = seedId('seed:bank-account:lane-8');
const { client, signIn } = memberClient('ryan.lane8@demo.esta.test', HOUSEHOLD);

const { importStatement, commitStatement } = await import('./statements');
const { loadColumnPresets, loadStatementImport } = await import('@/server/statements/load');

const run = Math.floor(Math.random() * 1e6)
  .toString()
  .padStart(6, '0');
const TENANTS = ['Phan Văn Sao Demo', 'Đỗ Thị Kê Demo', 'Mai Văn Nhập Demo', 'Lý Thị Khớp Demo', 'Tô Văn Mã Demo', 'Hồ Thị Gợi Demo'];
const house = roomingHouse(HOUSEHOLD, `Demo P3-15 ${run}`, `SK${run}`, TENANTS);
const leaseIds = house.leases.map((lease) => lease.id);

/** A file's lines as the browser sends them, with the header cells and how the columns were found. */
type Decoded = DecodedStatement & { readonly header: readonly string[]; readonly source: 'detected' | 'mapped' };
type Layout = 'a' | 'b' | 'c' | 'd';

let statement: HouseholdStatement;
let owedBills: OpenBill[];
const decoded: Partial<Record<Layout, Decoded>> = {};

/** Layouts A to C by their labels; layout D under the columns a person picks on the mapping, as the upload sends them. */
function read(file: StatementFile, id: Layout): Decoded {
  const picked = id === 'd' ? pickedHeader(file.grid, picksOf(UNRECOGNIZED_COLUMNS)) : null;
  if (picked !== null && !picked.ok) throw new Error(picked.reason);
  const result = file.decode(picked?.value);
  if (!result.ok) throw new Error(`${id}: ${result.reason}`);
  return { ...result.value, header: headerCells(file.grid, result.value.headerRow), source: id === 'd' ? 'mapped' : 'detected' };
}

async function insert(table: 'properties' | 'units' | 'parties' | 'leases', rows: unknown) {
  const { error } = await client.from(table).insert(rows as never);
  if (error) throw error;
}

async function seedRoomingHouse(): Promise<OpenBill[]> {
  await insert('properties', house.property);
  await insert('units', house.units);
  await insert('parties', house.parties);
  await insert('leases', house.leases);
  for (const activation of house.activations) {
    const { error } = await client.rpc('activate_lease', activation);
    if (error) throw error;
  }
  const { data, error } = await client
    .from('invoices')
    .select('id, number, memo_code, due_date, lease:leases!invoices_household_id_lease_id_fkey(tenant:parties!leases_household_id_tenant_party_id_fkey(full_name))')
    .in('lease_id', leaseIds)
    .eq('status', 'issued');
  if (error) throw error;
  return z
    .array(z.object({ id: z.string(), number: z.string(), memo_code: z.string(), due_date: z.string(), lease: z.object({ tenant: z.object({ full_name: z.string() }) }) }))
    .parse(data)
    .map((bill) => ({ id: bill.id, number: bill.number, memoCode: bill.memo_code, tenantName: bill.lease.tenant.full_name, dueDate: isoDate(bill.due_date), outstanding: vnd(0) }));
}

async function outstanding(ids: readonly string[]): Promise<Map<string, number>> {
  const { data, error } = await client.from('invoice_balances').select('id, outstanding_vnd').in('id', [...ids]);
  if (error) throw error;
  return new Map(data.map((row) => [row.id ?? '', row.outstanding_vnd ?? 0]));
}

const input = (file: Decoded, name: string) => ({
  import_id: crypto.randomUUID(),
  bank_account_id: ACCOUNT,
  file_name: name,
  column_mapping: { headerRow: file.headerRow, header: [...file.header], mapping: file.mapping, source: file.source },
  rejected: file.rejected,
  rows: file.rows,
});

async function lines(importId: string) {
  const { data, error } = await client
    .from('statement_rows')
    .select('id, row_index, status, reason, fingerprint, invoice:invoices!statement_rows_household_id_invoice_id_fkey(number), candidate_invoice_ids')
    .eq('import_id', importId)
    .order('row_index');
  if (error) throw error;
  return data;
}

/** The payments this file's import posted; an earlier run's stay in the lane. */
async function statementPayments(importId: string) {
  const ids = (await lines(importId)).map((row) => row.id);
  const { data, error } = await client.from('payments').select('id, amount_vnd, bank_account_id, statement_row_id, source').in('statement_row_id', ids);
  if (error) throw error;
  return data;
}

beforeAll(async () => {
  await signIn();
  const bills = await seedRoomingHouse();
  const owed = await outstanding(bills.map((bill) => bill.id));
  owedBills = bills.map((bill) => ({ ...bill, outstanding: vnd(owed.get(bill.id) ?? 0) })).filter((bill) => bill.outstanding > 0);
  statement = householdStatement(owedBills, isoDate('2026-10-07'), `IT${run}`);
  for (const [id, name, bytes] of [
    ['a', 'sao-ke.csv', new TextEncoder().encode(statementCsv(statement, 'a'))],
    ['b', 'sao-ke.xlsx', new Uint8Array(await statementXlsx(statement))],
    ['c', 'statement.csv', new TextEncoder().encode(statementCsv(statement, 'c'))],
    ['d', 'sao-ke-demo.csv', new TextEncoder().encode(unrecognizedCsv(statement))],
  ] as const) {
    const file = await decodeStatementFile(bytes, name);
    if (!file.ok) throw new Error(`${name}: ${file.reason}`);
    expect(fileColumns(file.value, undefined).kind).toBe(id === 'd' ? 'unknown' : 'detected');
    decoded[id] = read(file.value, id);
  }
}, 60_000);

describe('statement import against local Supabase (LSE-8)', () => {
  let importId = '';

  it('reads the same lines from every layout, by its labels or by the columns picked, the half-đồng line refused, so each line keeps one fingerprint', () => {
    const fingerprints = (['a', 'b', 'c', 'd'] as const).map((id) => matchRows(decoded[id]?.rows ?? [], []).map((row) => row.fingerprint));
    expect(fingerprints[0]).toHaveLength(statement.lines.length);
    for (const other of fingerprints.slice(1)) expect(other).toEqual(fingerprints[0]);
    for (const id of ['a', 'b', 'c'] as const) expect(decoded[id]?.rejected).toEqual([{ index: statement.lines.length + 1, field: 'amount', reason: 'fractional' }]);
    expect(decoded.d?.rejected).toEqual([{ index: UNRECOGNIZED_COLUMNS.headerRow + statement.lines.length + 1, field: 'amount', reason: 'fractional' }]);
  });

  it('stores layout A with each line as golden.json says and its fingerprint as the #58 contract gives it', async () => {
    const file = decoded.a as Decoded;
    const imported = await importStatement(input(file, 'sao-ke.csv'));
    if (!imported.ok) throw new Error(JSON.stringify(imported.reason));
    importId = imported.value.import_id;
    const stored = await lines(importId);
    const numbers = await client.from('invoices').select('id, number').in('lease_id', leaseIds);
    const numberOf = new Map((numbers.data ?? []).map((row) => [row.id, row.number]));
    expect(
      stored.map((row) => ({
        index: row.row_index,
        status: row.status,
        reason: row.reason,
        invoices: row.invoice === null ? row.candidate_invoice_ids.map((id) => numberOf.get(id)).toSorted() : [row.invoice.number],
      })),
    ).toEqual(golden(statement));
    expect(stored.map((row) => row.fingerprint)).toEqual(matchRows(file.rows, []).map((row) => row.fingerprint));
  });

  it('posts the three memo matches on commit into the account, and nothing else', async () => {
    expect(await commitStatement({ import_id: importId, confirmed_row_ids: [] })).toEqual({ ok: true, value: { posted: 3, skipped: 0 } });
    const payments = await statementPayments(importId);
    expect(payments.map((payment) => payment.amount_vnd).toSorted()).toEqual(statement.lines.slice(0, 3).map((line) => line.amount as number).toSorted());
    expect(payments.every((payment) => payment.bank_account_id === ACCOUNT && payment.source === 'statement_import')).toBe(true);
    expect(await commitStatement({ import_id: importId, confirmed_row_ids: [] })).toEqual({ ok: true, value: { posted: 0, skipped: 0 } });
  });

  it('stores and posts nothing when the same statement comes back in any layout, the unrecognized one read by a mapping too', async () => {
    const before = (await lines(importId)).map((row) => row.fingerprint);
    for (const [id, name] of [
      ['a', 'sao-ke.csv'],
      ['b', 'sao-ke.xlsx'],
      ['c', 'statement.csv'],
      ['d', 'sao-ke-demo.csv'],
    ] as const) {
      expect(await importStatement(input(decoded[id] as Decoded, name))).toEqual({ ok: false, reason: { kind: 'nothingNew', importId } });
    }
    expect(await statementPayments(importId)).toHaveLength(3);
    expect((await lines(importId)).map((row) => row.fingerprint)).toEqual(before);
  });

  it('posts the suggestion once it is confirmed, and only once', async () => {
    const suggestion = (await lines(importId)).find((row) => row.status === 'suggested');
    expect(suggestion?.row_index).toBe(4);
    const confirm = { import_id: importId, confirmed_row_ids: [suggestion?.id ?? ''] };
    expect(await commitStatement(confirm)).toEqual({ ok: true, value: { posted: 1, skipped: 0 } });
    expect(await commitStatement(confirm)).toEqual({ ok: true, value: { posted: 0, skipped: 0 } });
    expect(await statementPayments(importId)).toHaveLength(4);
  });

  it('keeps the account’s columns from its latest committed import or mapped one, never from an uncommitted import Esta read by its labels', async () => {
    const presets = async () => (await loadColumnPresets(HOUSEHOLD, [ACCOUNT]))[ACCOUNT];
    expect(await presets()).toEqual({ headerRow: 0, header: decoded.a?.header, mapping: decoded.a?.mapping, source: 'detected' });
    // Two more statements of the same October bills, under new bank references, so their lines are new to the account.
    const next = householdStatement(owedBills, isoDate('2026-10-07'), `IU${run}`);
    const mapped = await decodeStatementFile(new TextEncoder().encode(unrecognizedCsv(next)), 'sao-ke-demo-2.csv');
    if (!mapped.ok) throw new Error(mapped.reason);
    const imported = await importStatement(input(read(mapped.value, 'd'), 'sao-ke-demo-2.csv'));
    if (!imported.ok) throw new Error(JSON.stringify(imported.reason));
    // The preview numbers its lines from the header, under the bank's four account lines, as it does for a known layout.
    const view = await loadStatementImport(HOUSEHOLD, imported.value.import_id);
    expect(view?.lines.map((line) => line.index)).toEqual(golden(next).map((line) => line.index));
    expect(view?.refused).toEqual([{ index: next.lines.length + 1, field: 'amount', reason: 'fractional' }]);
    const columns = { headerRow: UNRECOGNIZED_COLUMNS.headerRow, header: decoded.d?.header, mapping: UNRECOGNIZED_COLUMNS.mapping, source: 'mapped' };
    expect(await presets()).toEqual(columns);
    const labelled = await decodeStatementFile(new TextEncoder().encode(statementCsv(householdStatement(owedBills, isoDate('2026-10-07'), `IV${run}`), 'c')), 'statement-2.csv');
    if (!labelled.ok) throw new Error(labelled.reason);
    expect(await importStatement(input(read(labelled.value, 'c'), 'statement-2.csv'))).toMatchObject({ ok: true });
    expect(await presets()).toEqual(columns);
  });
});
