import { firstOfMonth } from '../date/calendar';
import type { IsoDate } from '../date/iso-date';
import { numberOf, type ExportCell, type ExportTable } from '../export/table';
import { vnd, type Vnd } from '../money/vnd';
import { propertyLedger } from './propertyPnl';
import type { ReportSnapshot } from './snapshot';

export type ReportTables = {
  readonly pnl: ExportTable;
  readonly rentRoll?: ExportTable;
  readonly collections?: ExportTable;
  readonly occupancy?: ExportTable;
  readonly portfolio?: ExportTable;
  readonly owners?: ExportTable;
};

/** One figure a report shows beside the figure it must equal. */
export type InvariantCheck =
  | { readonly kind: 'monthIncome'; readonly propertyId: string; readonly month: IsoDate; readonly expectedVnd: Vnd; readonly reportedVnd: Vnd }
  | { readonly kind: 'pnlIncome'; readonly propertyId: string; readonly expectedVnd: Vnd; readonly reportedVnd: Vnd | null }
  | { readonly kind: 'totals'; readonly report: keyof ReportTables; readonly column: string; readonly expected: number; readonly reported: number }
  | { readonly kind: 'ownerSplit'; readonly column: string; readonly expectedVnd: Vnd; readonly reportedVnd: Vnd | null };

export const holds = (check: InvariantCheck): boolean => (check.kind === 'totals' ? check.expected === check.reported : check.expectedVnd === check.reportedVnd);

const amount = (cell: ExportCell | undefined): Vnd | null => (cell?.kind === 'vnd' ? cell.value : null);

const column = (table: ExportTable, id: string) => table.columns.findIndex((candidate) => candidate.id === id);

function totalsChecks(report: keyof ReportTables, table: ExportTable): InvariantCheck[] {
  return table.columns.flatMap(({ id }, index) => {
    const reported = numberOf(table.totals.cells[index]);
    if (reported === null) return [];
    const expected = table.rows.reduce((sum, row) => sum + (numberOf(row.cells[index]) ?? 0), 0);
    return [{ kind: 'totals', report, column: id, expected, reported }];
  });
}

function ownerSplitChecks(pnl: ExportTable, owners: ExportTable): InvariantCheck[] {
  return (['income', 'expenses'] as const).map((id) => ({
    kind: 'ownerSplit',
    column: id,
    expectedVnd: amount(pnl.totals.cells[column(pnl, id)]) ?? vnd(0),
    reportedVnd: amount(owners.totals.cells[column(owners, id)]),
  }));
}

/**
 * FIN-4: each property's P&L income for every month of the period is the sum of its `allocation_facts` received that
 * month, its P&L row is the sum of those months, every table's totals row is the sum of its rows, and the owner summary's
 * income and expenses add up to the P&L's.
 */
export function checkReportInvariants(snapshot: ReportSnapshot, tables: ReportTables): InvariantCheck[] {
  const incomeColumn = column(tables.pnl, 'income');
  const pnl = snapshot.properties.flatMap((property): InvariantCheck[] => {
    const ledger = propertyLedger(snapshot, property.id);
    const facts = snapshot.incomes.filter((fact) => fact.propertyId === property.id);
    const months = ledger.months.map(
      (month): InvariantCheck => ({
        kind: 'monthIncome',
        propertyId: property.id,
        month: month.monthStart,
        expectedVnd: vnd(facts.filter((fact) => firstOfMonth(fact.receivedOn) === month.monthStart).reduce((sum, fact) => sum + fact.amountVnd, 0)),
        reportedVnd: month.incomeVnd,
      }),
    );
    const row = tables.pnl.rows.find((candidate) => candidate.key === property.id);
    return [...months, { kind: 'pnlIncome', propertyId: property.id, expectedVnd: ledger.totals.incomeVnd, reportedVnd: amount(row?.cells[incomeColumn]) }];
  });
  const totals = (Object.keys(tables) as (keyof ReportTables)[]).flatMap((report) => {
    const table = tables[report];
    return table === undefined ? [] : totalsChecks(report, table);
  });
  return [...pnl, ...totals, ...(tables.owners === undefined ? [] : ownerSplitChecks(tables.pnl, tables.owners))];
}
