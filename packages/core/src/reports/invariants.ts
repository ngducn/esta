import { firstOfMonth } from '../date/calendar';
import type { IsoDate } from '../date/iso-date';
import type { ExportCell, ExportTable } from '../export/table';
import { vnd, type Vnd } from '../money/vnd';
import { propertyLedger } from './propertyPnl';
import type { ReportSnapshot } from './snapshot';

export type ReportTables = { readonly pnl: ExportTable; readonly rentRoll?: ExportTable; readonly collections?: ExportTable };

/** One figure a report shows beside the figure it must equal. */
export type InvariantCheck =
  | { readonly kind: 'monthIncome'; readonly propertyId: string; readonly month: IsoDate; readonly expectedVnd: Vnd; readonly reportedVnd: Vnd }
  | { readonly kind: 'pnlIncome'; readonly propertyId: string; readonly expectedVnd: Vnd; readonly reportedVnd: Vnd | null }
  | { readonly kind: 'totals'; readonly report: keyof ReportTables; readonly column: string; readonly expectedVnd: Vnd; readonly reportedVnd: Vnd };

export const holds = (check: InvariantCheck): boolean => check.expectedVnd === check.reportedVnd;

const amount = (cell: ExportCell | undefined): Vnd | null => (cell?.kind === 'vnd' ? cell.value : null);

function totalsChecks(report: keyof ReportTables, table: ExportTable): InvariantCheck[] {
  return table.columns.flatMap((column, index) => {
    const reported = amount(table.totals.cells[index]);
    if (reported === null) return [];
    const expected = vnd(table.rows.reduce((sum, row) => sum + (amount(row.cells[index]) ?? 0), 0));
    return [{ kind: 'totals', report, column: column.id, expectedVnd: expected, reportedVnd: reported }];
  });
}

/**
 * FIN-4: each property's P&L income for every month of the period is the sum of its `allocation_facts` received that
 * month, its P&L row is the sum of those months, and every table's totals row is the sum of its rows.
 */
export function checkReportInvariants(snapshot: ReportSnapshot, tables: ReportTables): InvariantCheck[] {
  const incomeColumn = tables.pnl.columns.findIndex((column) => column.id === 'income');
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
  return [...pnl, ...totals];
}
