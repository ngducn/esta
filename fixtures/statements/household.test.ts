import { describe, expect, it } from 'vitest';
import { isoDate } from '../../packages/core/src/date/iso-date.ts';
import { decodeStatement, decodeStatementCsv } from '../../packages/core/src/matching/decode.ts';
import { planImport } from '../../packages/core/src/matching/import.ts';
import { vnd } from '../../packages/core/src/money/vnd.ts';
import { UNRECOGNIZED_COLUMNS } from '../../packages/core/src/matching/statement-scenario.ts';
import { golden, householdStatement, statementCsv, statementGrid, unrecognizedCsv, type OpenBill } from './household.ts';

const bill = (number: string, memoCode: string, tenantName: string, dueDate: string, outstanding: number): OpenBill => ({
  id: `id-${number}`,
  number,
  memoCode,
  tenantName,
  dueDate: isoDate(dueDate),
  outstanding: vnd(outstanding),
});

// Lane 2 of the full seed on 2026-10-07: Phòng 5 owes September, and six rooms owe October.
const OPEN = [
  bill('DIAN-202609-003', 'EA44AGVN', 'Hoàng Văn Em Demo', '2026-09-25', 2_800_000),
  bill('DIAN-202610-001', 'BZZ52QQA', 'Đặng Thị Giang Demo', '2026-10-25', 2_800_000),
  bill('DIAN-202610-002', 'X6AF8Y6J', 'Lê Văn Cường Demo', '2026-10-25', 2_500_000),
  bill('DIAN-202610-003', 'DQSSHKUZ', 'Hoàng Văn Em Demo', '2026-10-25', 2_800_000),
  bill('DIAN-202610-004', '8J6R6558', 'Võ Thị Dung Demo', '2026-10-25', 2_500_000),
  bill('DIAN-202610-005', 'CMDEMC2T', 'Trần Thị Bình Demo', '2026-10-25', 2_500_000),
  bill('DIAN-202610-006', '257468QP', 'Nguyễn Văn An Demo', '2026-10-25', 2_500_000),
];
const statement = householdStatement(OPEN, isoDate('2026-10-07'), 'FT02');
const numberOf = new Map(OPEN.map((open) => [open.id, open.number]));

const LAYOUTS = ['a', 'b', 'c', 'd'] as const;
type Layout = (typeof LAYOUTS)[number];
/** Layout D is the bank Esta does not recognize, read under the columns a person picks (P3-21). */
const headerRow = (id: Layout) => (id === 'd' ? UNRECOGNIZED_COLUMNS.headerRow : 0);

function decoded(id: Layout) {
  const result =
    id === 'b' ? decodeStatement(statementGrid(statement, 'b')) : id === 'd' ? decodeStatementCsv(unrecognizedCsv(statement), UNRECOGNIZED_COLUMNS) : decodeStatementCsv(statementCsv(statement, id));
  if (!result.ok) throw new Error(result.reason);
  return result.value;
}

describe('householdStatement', () => {
  it.each(LAYOUTS)('layout %s imports exactly as its golden lines say, the half-đồng line refused', (id) => {
    const { rows, rejected } = decoded(id);
    const plan = planImport(rows, OPEN.map((open) => ({ ...open, status: 'issued' })), []);
    expect(
      plan.rows.map((stored) => ({
        index: stored.row.index,
        status: stored.status,
        reason: stored.reason,
        invoices: (stored.invoiceId === null ? stored.candidateIds : [stored.invoiceId]).map((invoiceId) => numberOf.get(invoiceId)).toSorted(),
      })),
    ).toEqual(golden(statement, headerRow(id)));
    expect(rejected).toEqual([{ index: headerRow(id) + statement.lines.length + 1, field: 'amount', reason: 'fractional' }]);
  });

  it('gives the same fingerprints in every layout, dated on or before the clock', () => {
    const fingerprints = LAYOUTS.map((id) => planImport(decoded(id).rows, [], []).rows.map((stored) => stored.fingerprint));
    for (const other of fingerprints.slice(1)) expect(other).toEqual(fingerprints[0]);
    expect(statement.lines.every((line) => line.date <= statement.asOf)).toBe(true);
  });

  it('refuses a household with too few open bills', () => {
    expect(() => householdStatement(OPEN.slice(0, 5), isoDate('2026-10-07'))).toThrow(/needs six/);
  });
});
