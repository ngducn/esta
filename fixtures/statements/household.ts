import { randomUUID } from 'node:crypto';
import writeXlsxFile from 'write-excel-file/node';
import { addDays, daysBetween } from '../../packages/core/src/date/calendar.ts';
import type { IsoDate } from '../../packages/core/src/date/iso-date.ts';
import { STATEMENT_LAYOUTS, type StatementCell, type StatementGrid, type StatementLayout, type StatementLayoutId } from '../../packages/core/src/matching/layouts.ts';
import type { ImportReason, ImportStatus } from '../../packages/core/src/matching/import.ts';
import { renderCsv, renderStatementGrid, type RenderableRow } from '../../packages/core/src/matching/render.ts';
import { UNRECOGNIZED_LAYOUT, UNRECOGNIZED_PREAMBLE } from '../../packages/core/src/matching/statement-scenario.ts';
import { vnd, type Vnd } from '../../packages/core/src/money/vnd.ts';
import { foldVietnamese } from '../../packages/core/src/search/fold.ts';

/** A bill the household still owes, as the generator reads it from the slot's database. */
export type OpenBill = { id: string; number: string; memoCode: string; tenantName: string; dueDate: IsoDate; outstanding: Vnd };

/** What the import must make of a line: its status, why, and the bill numbers it names. */
export type Expected = { status: ImportStatus; reason: ImportReason | null; invoices: string[] };
export type ScenarioLine = RenderableRow & { expect: Expected };

/** The October statement of one household, every line stating its intended match, dated on or before `asOf`. */
export type HouseholdStatement = { asOf: IsoDate; lines: ScenarioLine[]; fractional: RenderableRow };

const SUGGESTION_WINDOW_DAYS = 10;
const upper = (name: string) => foldVietnamese(name).toUpperCase();
const expectLine = (status: ImportStatus, invoices: string[] = [], reason: ImportReason | null = null): Expected => ({ status, reason, invoices });

/** A bill a transfer dated `on` can suggest alone: no other open bill of its tenant owes the same within the window. */
function suggestible(bill: OpenBill, on: IsoDate, open: readonly OpenBill[]): boolean {
  return !open.some(
    (other) => other !== bill && other.tenantName === bill.tenantName && other.outstanding === bill.outstanding && Math.abs(daysBetween(other.dueDate, on)) <= SUGGESTION_WINDOW_DAYS,
  );
}

/**
 * The P3-06 scenario (packages/core/src/matching/statement-scenario.ts) over a real household's open bills: three memo
 * matches (one with bank noise, one in lowercase, one inside `FIESTA`), one suggestion by name and amount, `CAFE
 * FIESTA`, two codes in one line, an unknown code, two debits, a repeated bank reference, two identical counter
 * deposits without a reference, and a half-đồng line the decoder refuses. `refPrefix` starts every bank reference and
 * the counter deposits' text, so two statements made for one household never share a fingerprint.
 */
export function householdStatement(open: readonly OpenBill[], asOf: IsoDate, refPrefix = 'FT01'): HouseholdStatement {
  const byDue = open.toSorted((a, b) => a.dueDate.localeCompare(b.dueDate) || a.number.localeCompare(b.number));
  const suggestOn = (bill: OpenBill): IsoDate => (daysBetween(bill.dueDate, asOf) > 3 ? addDays(bill.dueDate, 3) : asOf);
  const suggested = byDue.find((bill) => daysBetween(asOf, bill.dueDate) <= SUGGESTION_WINDOW_DAYS && suggestible(bill, suggestOn(bill), open));
  const rest = byDue.filter((bill) => bill !== suggested).toSorted((a, b) => a.number.localeCompare(b.number));
  const [first, second, third, left, right] = rest;
  if (suggested === undefined || first === undefined || second === undefined || third === undefined || left === undefined || right === undefined) {
    throw new Error(`The household owes ${open.length} bills; the scenario needs six, one of them due by ${addDays(asOf, SUGGESTION_WINDOW_DAYS)}`);
  }
  const ref = (n: number) => `${refPrefix}${String(n).padStart(6, '0')}`;
  const on = (daysBefore: number) => addDays(asOf, -daysBefore);
  const noisy: ScenarioLine = {
    date: on(5),
    amount: first.outstanding,
    bankRef: ref(1),
    description: `MBVCB.2627501.ESTA${first.memoCode}.CT TU 0903123456 ${upper(first.tenantName)}`,
    expect: expectLine('memo_match', [first.number]),
  };
  const counter: RenderableRow = { date: on(2), amount: vnd(500_000), bankRef: '', description: `NOP TIEN MAT TAI QUAY ${refPrefix}` };
  const lines: ScenarioLine[] = [
    noisy,
    { date: on(4), amount: second.outstanding, bankRef: ref(2), description: `esta ${second.memoCode.toLowerCase()} tien phong thang 10`, expect: expectLine('memo_match', [second.number]) },
    { date: on(3), amount: third.outstanding, bankRef: ref(3), description: `FIESTAESTA${third.memoCode} ${upper(third.tenantName)}`, expect: expectLine('memo_match', [third.number]) },
    {
      date: suggestOn(suggested),
      amount: suggested.outstanding,
      bankRef: ref(4),
      description: `${upper(suggested.tenantName)} CHUYEN TIEN THUE PHONG`,
      expect: expectLine('suggested', [suggested.number]),
    },
    { date: on(3), amount: first.outstanding, bankRef: ref(5), description: 'CAFE FIESTA THANH TOAN', expect: expectLine('unmatched') },
    {
      date: on(2),
      amount: vnd(left.outstanding + right.outstanding),
      bankRef: ref(6),
      description: `ESTA ${left.memoCode} ESTA ${right.memoCode} CK HAI PHONG`,
      expect: expectLine('unmatched', [left.number, right.number].toSorted()),
    },
    { date: on(2), amount: vnd(-11_000), bankRef: ref(7), description: 'PHI DICH VU SMS BANKING', expect: expectLine('ignored', [], 'debit') },
    { date: on(1), amount: vnd(-2_000_000), bankRef: ref(8), description: 'RUT TIEN ATM', expect: expectLine('ignored', [], 'debit') },
    { date: on(1), amount: vnd(850_000), bankRef: ref(9), description: 'ESTA ZZZZZZZZ CHUYEN TIEN', expect: expectLine('unmatched') },
    { ...noisy, expect: expectLine('ignored', [], 'duplicate') },
    { ...counter, expect: expectLine('unmatched') },
    { ...counter, expect: expectLine('unmatched', [], 'repeat') },
  ];
  return { asOf, lines, fractional: { date: on(1), amount: vnd(1_500_000), bankRef: ref(13), description: 'NUA DONG DEMO' } };
}

const FRACTIONAL: Readonly<Record<StatementLayout['amountStyle'], StatementCell>> = {
  dot_grouped: '1.500.000,50',
  comma_grouped_cents: '1,500,000.50',
  number: 1_500_000.5,
};

function layoutGrid(statement: HouseholdStatement, layout: StatementLayout): StatementGrid {
  const [, fractional = []] = renderStatementGrid(layout, [statement.fractional]);
  const half = fractional.map((cell, column) => (['amount', 'credit'].includes(layout.columns[column]?.role ?? '') ? FRACTIONAL[layout.amountStyle] : cell));
  return [...renderStatementGrid(layout, statement.lines), half];
}

/** Each layout of DOMAIN-VN §9, with the half-đồng line last. */
export const statementGrid = (statement: HouseholdStatement, id: StatementLayoutId): StatementGrid => layoutGrid(statement, STATEMENT_LAYOUTS[id]);

/** The same statement from a bank Esta does not recognize (P3-21), its account lines first: it imports through the column mapping. */
export const unrecognizedCsv = (statement: HouseholdStatement): string => renderCsv([...UNRECOGNIZED_PREAMBLE, ...layoutGrid(statement, UNRECOGNIZED_LAYOUT)]);

export const statementCsv = (statement: HouseholdStatement, id: 'a' | 'c'): string => renderCsv(statementGrid(statement, id));

export async function statementXlsx(statement: HouseholdStatement): Promise<Buffer> {
  const data = statementGrid(statement, 'b').map((row) => row.map((cell) => (cell === null ? null : { value: cell })));
  return writeXlsxFile([{ sheet: 'Sao ke', data }], {}).toBuffer();
}

/**
 * The account's next statement from the bank Esta does not recognize (P3-21): one transfer on `on` naming each bill
 * still owed by its code, under new bank references, with `header` in place of that bank's own labels when given.
 */
export function nextUnrecognizedCsv(bills: readonly OpenBill[], on: IsoDate, refPrefix: string, header?: readonly string[]): string {
  const rows = bills.map((bill, i) => ({ date: on, amount: bill.outstanding, bankRef: `${refPrefix}${String(i + 1).padStart(6, '0')}`, description: `CK ESTA${bill.memoCode}` }));
  const [labels = [], ...lines] = renderStatementGrid(UNRECOGNIZED_LAYOUT, rows);
  return renderCsv([...UNRECOGNIZED_PREAMBLE, header ?? labels, ...lines]);
}

/** The file line (a 1-based data row under the header, which sits `headerRow` lines down) and what the import must make of it. */
export const golden = (statement: HouseholdStatement, headerRow = 0) => statement.lines.map((line, i) => ({ index: headerRow + i + 1, ...line.expect }));

/**
 * A Demo rooming house as rows for any client to insert: one monthly lease a room from January, each activated paid
 * through September, so on 07/10/2026 every room owes its October bill, due 01/10.
 */
export function roomingHouse(householdId: string, nickname: string, code: string, tenants: readonly string[]) {
  const propertyId = randomUUID();
  const rooms = tenants.map((name, i) => ({ unit: randomUUID(), tenant: randomUUID(), lease: randomUUID(), label: `Phòng ${i + 1}`, name }));
  return {
    property: { id: propertyId, household_id: householdId, nickname, code, kind: 'rooming_house', use_mode: 'rental' },
    units: rooms.map((room) => ({ id: room.unit, household_id: householdId, property_id: propertyId, label: room.label, kind: 'room' })),
    parties: rooms.map((room) => ({ id: room.tenant, household_id: householdId, kind: 'individual', full_name: room.name, tags: ['tenant'] })),
    leases: rooms.map((room, i) => ({
      id: room.lease,
      household_id: householdId,
      property_id: propertyId,
      unit_id: room.unit,
      tenant_party_id: room.tenant,
      start_date: '2026-01-01',
      end_date: '2027-06-30',
      rent_vnd: i % 2 === 0 ? 2_500_000 : 2_800_000,
      due_offset_days: 0,
    })),
    activations: rooms.map((room) => ({ p_lease_id: room.lease, p_paid_through: '2026-09-30' })),
    roomOfLease: new Map<string, string>(rooms.map((room) => [room.lease, room.label])),
  };
}
