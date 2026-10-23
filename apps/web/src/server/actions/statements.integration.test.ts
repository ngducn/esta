import { isoDate } from '@esta/core/date';
import { addDays } from '@esta/core/date/calendar';
import { matchRows, type DecodedStatement, type DetectedHeader } from '@esta/core/matching';
import { vnd } from '@esta/core/money';
import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  golden,
  householdStatement,
  nextUnrecognizedCsv,
  roomingHouse,
  statementCsv,
  statementXlsx,
  unrecognizedCsv,
  type HouseholdStatement,
  type OpenBill,
} from '../../../../../fixtures/statements/household.ts';
import { UNRECOGNIZED_COLUMNS } from '../../../../../packages/core/src/matching/statement-scenario';
import { decodeStatementFile, fileColumns, headerCells, pickedHeader, picksOf, type StatementFile } from '@/lib/statements/decodeStatementFile';
import { integrationLane } from '@/test/lanes';
import { memberClient } from '@/test/member-client';

// `pnpm test:integration` (scripts/web-integration.ts) sets the slot's database clock to 2026-10-07. The file adds its
// own Demo rooming house and receiving account to its lane, whose six leases owe October, and imports the statement
// fixtures/statements/household.ts writes for those bills in each of the three layouts, and as layout D, a bank Esta
// does not recognize, read under the columns a person picks (P3-21).
const { household: HOUSEHOLD, ryan } = integrationLane(import.meta.url);
const { client, signIn } = memberClient(ryan, HOUSEHOLD);

const { importStatement, commitStatement } = await import('./statements');
const { loadColumnPresets, loadStatementImport } = await import('@/server/statements/load');

const run = Math.floor(Math.random() * 1e6)
  .toString()
  .padStart(6, '0');
// Names of the run's own, so a suggestion by name never finds an earlier run's tenant in the lane.
const TENANTS = ['Phan Văn Sao', 'Đỗ Thị Kê', 'Mai Văn Nhập', 'Lý Thị Khớp', 'Tô Văn Mã', 'Hồ Thị Gợi'].map((name) => `${name} ${run} Demo`);
const house = roomingHouse(HOUSEHOLD, `Demo P3-15 ${run}`, `SK${run}`, TENANTS);
// A receiving account of the run's own: lines are compared with the lines the same account already holds (P3-21).
const ACCOUNT = crypto.randomUUID();
const leaseIds = house.leases.map((lease) => lease.id);

/** A file's lines as the browser sends them, with the header cells they were read under. */
type Decoded = DecodedStatement & { readonly header: readonly string[] };
type Layout = 'a' | 'b' | 'c' | 'd';
/** Layout D's columns with no bank reference picked: `Không có` on the mapping. */
const WITHOUT_REFERENCE: DetectedHeader = { ...UNRECOGNIZED_COLUMNS, mapping: { ...UNRECOGNIZED_COLUMNS.mapping, bankRef: null } };
const encode = (text: string) => new TextEncoder().encode(text);

let statement: HouseholdStatement;
let owedBills: OpenBill[];
const decoded: Partial<Record<Layout, Decoded>> = {};

/** A file read by its labels, or under the columns a person picks on the mapping, as the upload sends it. */
function read(file: StatementFile, chosen?: DetectedHeader): Decoded {
  const picked = chosen === undefined ? null : pickedHeader(file.grid, picksOf(chosen));
  if (picked !== null && !picked.ok) throw new Error(picked.reason);
  const result = file.decode(picked?.value);
  if (!result.ok) throw new Error(result.reason);
  return { ...result.value, header: headerCells(file.grid, result.value.headerRow) };
}

async function readFile(text: string, name: string, chosen?: DetectedHeader): Promise<Decoded> {
  const file = await decodeStatementFile(encode(text), name);
  if (!file.ok) throw new Error(`${name}: ${file.reason}`);
  return read(file.value, chosen);
}

async function insert(table: 'bank_accounts' | 'properties' | 'units' | 'parties' | 'leases', rows: unknown) {
  const { error } = await client.from(table).insert(rows as never);
  if (error) throw error;
}

async function seedRoomingHouse(): Promise<OpenBill[]> {
  await insert('bank_accounts', { id: ACCOUNT, household_id: HOUSEHOLD, bank_bin: '970436', account_no: `8${run}`, account_name: 'DEMO P3 21' });
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
  column_mapping: { headerRow: file.headerRow, header: [...file.header], mapping: file.mapping },
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
    decoded[id] = read(file.value, id === 'd' ? UNRECOGNIZED_COLUMNS : undefined);
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

  it('stores and posts nothing when the same statement comes back in any layout, or under other columns of the bank Esta does not know', async () => {
    const before = (await lines(importId)).map((row) => row.fingerprint);
    const valueDated = { ...statement, lines: statement.lines.filter((line) => line.bankRef !== '').map((line) => ({ ...line, date: addDays(line.date, -2) })) };
    for (const [name, file] of [
      ['sao-ke.csv', decoded.a],
      ['sao-ke.xlsx', decoded.b],
      ['statement.csv', decoded.c],
      ['sao-ke-demo.csv', decoded.d],
      // The reference column left as `Không có`: the same date, amount and description name the same transfer.
      ['sao-ke-demo-khong-tham-chieu.csv', await readFile(unrecognizedCsv(statement), 'sao-ke-demo-khong-tham-chieu.csv', WITHOUT_REFERENCE)],
      // A value date two days off the transaction date: the same reference and amount within 3 days name the same transfer.
      ['sao-ke-demo-ngay-hieu-luc.csv', await readFile(unrecognizedCsv(valueDated), 'sao-ke-demo-ngay-hieu-luc.csv', UNRECOGNIZED_COLUMNS)],
    ] as const) {
      expect(await importStatement(input(file as Decoded, name))).toEqual({ ok: false, reason: { kind: 'nothingNew', importId } });
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

  it('keeps the account’s columns from its latest import that posted a line, and posts nothing twice when the reference column is picked later (lane 4)', async () => {
    const presets = async () => (await loadColumnPresets(HOUSEHOLD, [ACCOUNT]))[ACCOUNT];
    const labels = { headerRow: 0, header: decoded.a?.header, mapping: decoded.a?.mapping };
    expect(await presets()).toEqual(labels);
    const owed = await outstanding(owedBills.map((bill) => bill.id));
    const stillOwed = owedBills.filter((bill) => (owed.get(bill.id) ?? 0) > 0).map((bill) => ({ ...bill, outstanding: vnd(owed.get(bill.id) ?? 0) }));
    expect(stillOwed).toHaveLength(2);
    const csv = nextUnrecognizedCsv(stillOwed, isoDate('2026-10-07'), `IU${run}`);

    // Read with the reference left as `Không có` and previewed: columns picked for an import that posted nothing are not saved.
    const imported = await importStatement(input(await readFile(csv, 'sao-ke-demo-2.csv', WITHOUT_REFERENCE), 'sao-ke-demo-2.csv'));
    if (!imported.ok) throw new Error(JSON.stringify(imported.reason));
    const next = imported.value.import_id;
    // The preview numbers its lines from the header, under the bank's four account lines, as it does for a known layout.
    expect((await loadStatementImport(HOUSEHOLD, next))?.lines.map((line) => line.index)).toEqual([1, 2]);
    expect(await presets()).toEqual(labels);

    expect(await commitStatement({ import_id: next, confirmed_row_ids: [] })).toEqual({ ok: true, value: { posted: 2, skipped: 0 } });
    const mapped = { headerRow: UNRECOGNIZED_COLUMNS.headerRow, header: decoded.d?.header, mapping: WITHOUT_REFERENCE.mapping };
    expect(await presets()).toEqual(mapped);

    // The same file again with the reference column picked: every line is known, so nothing is stored or posted.
    expect(await importStatement(input(await readFile(csv, 'sao-ke-demo-2.csv', UNRECOGNIZED_COLUMNS), 'sao-ke-demo-2.csv'))).toEqual({
      ok: false,
      reason: { kind: 'nothingNew', importId: next },
    });
    expect(await statementPayments(next)).toHaveLength(2);
    const after = await outstanding(stillOwed.map((bill) => bill.id));
    expect([...after.values()]).toEqual([0, 0]);

    // An import Esta reads by its labels and nothing posts from leaves the saved columns as they are.
    const labelled = householdStatement(owedBills, isoDate('2026-10-07'), `IV${run}`);
    expect(await importStatement(input(await readFile(statementCsv(labelled, 'c'), 'statement-2.csv'), 'statement-2.csv'))).toMatchObject({ ok: true });
    expect(await presets()).toEqual(mapped);
  });
});
