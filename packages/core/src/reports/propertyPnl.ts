import { textCell, vndCell, type ExportCell, type ExportTable } from '../export/table';
import { buildLedger, type Ledger, type LedgerSums } from '../ledger/buildLedger';
import { vnd } from '../money/vnd';
import type { ReportSnapshot } from './snapshot';

export type PnlLabels = { readonly property: string; readonly income: string; readonly expenses: string; readonly noi: string; readonly total: string; readonly archived: string };

/** The key of the row that carries the income of properties archived since it was received. */
const ARCHIVED_PNL_KEY = 'archived';

/** The property's ledger over the snapshot's period, by the P4-03 rule: income on the day it was received. */
export function propertyLedger(snapshot: ReportSnapshot, propertyId: string): Ledger {
  return buildLedger({
    incomes: snapshot.incomes.filter((fact) => fact.propertyId === propertyId),
    expenses: snapshot.expenses.filter((fact) => fact.propertyId === propertyId),
    from: snapshot.from,
    to: snapshot.to,
  });
}

/** Properties archived by now that still received income in the period, in id order. */
export function archivedPropertyIds(snapshot: ReportSnapshot): string[] {
  const live = new Set(snapshot.properties.map((property) => property.id));
  return [...new Set(snapshot.incomes.map((fact) => fact.propertyId).filter((id) => !live.has(id)))].toSorted();
}

const collator = new Intl.Collator('vi', { numeric: true });

type Amounts = Pick<LedgerSums, 'incomeVnd' | 'expensesVnd' | 'noiVnd'>;

const cells = (sums: Amounts): ExportCell[] => [vndCell(sums.incomeVnd), vndCell(sums.expensesVnd), vndCell(sums.noiVnd)];

/**
 * FIN-4: one row per live property, keyed by its id, with its income, expenses and net for the period, and a totals row.
 * Income received on properties archived since stays in the household's money: one last row carries it, with no expenses.
 */
export function propertyPnl(snapshot: ReportSnapshot, labels: PnlLabels): ExportTable {
  const lines: { property: { id: string; name: string }; sums: Amounts }[] = snapshot.properties
    .toSorted((a, b) => collator.compare(a.name, b.name))
    .map((property) => ({ property, sums: propertyLedger(snapshot, property.id).totals }));
  const archived = archivedPropertyIds(snapshot).map((id) => propertyLedger(snapshot, id).totals);
  if (archived.length > 0) {
    const incomeVnd = vnd(archived.reduce((total, sums) => total + sums.incomeVnd, 0));
    lines.push({ property: { id: ARCHIVED_PNL_KEY, name: labels.archived }, sums: { incomeVnd, expensesVnd: vnd(0), noiVnd: incomeVnd } });
  }
  const sum = (pick: (sums: Amounts) => number) => vnd(lines.reduce((total, line) => total + pick(line.sums), 0));
  return {
    columns: [
      { id: 'property', label: labels.property },
      { id: 'income', label: labels.income },
      { id: 'expenses', label: labels.expenses },
      { id: 'noi', label: labels.noi },
    ],
    rows: lines.map(({ property, sums }) => ({ key: property.id, cells: [textCell(property.name), ...cells(sums)] })),
    totals: { key: 'total', cells: [textCell(labels.total), ...cells({ incomeVnd: sum((s) => s.incomeVnd), expensesVnd: sum((s) => s.expensesVnd), noiVnd: sum((s) => s.noiVnd) })] },
  };
}
