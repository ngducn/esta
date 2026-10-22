import type { ExportCell, ExportColumn, ExportRow, ExportTable } from '@esta/core/export';
import { formatVnd } from '@esta/core/format';
import { getLocale } from 'next-intl/server';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { ScrollIntoView } from './scroll-into-view';

const ALWAYS_SHOWN = new Set(['income', 'expenses', 'noi']);

export const ledgerRowId = (key: string) => `ledger-${key}`;

/**
 * The ledger's one `ExportTable` as the Thu chi tab shows it. Below 640 px each month stacks into label and amount lines,
 * leaving out the categories it spent nothing on.
 */
export async function LedgerTable({ table, caption, marked }: { table: ExportTable; caption: string; marked: { key: string; label: string } | null }) {
  const locale = await getLocale();
  const value = (cell: ExportCell | undefined) => (cell === undefined ? '' : cell.kind === 'vnd' ? formatVnd(cell.value, locale) : cell.value);
  const amountColumns = table.columns.slice(1);

  const row = (line: ExportRow, kind: 'month' | 'total') => {
    const isMarked = marked?.key === line.key;
    return (
      <TableRow
        key={line.key}
        id={kind === 'month' ? ledgerRowId(line.key) : undefined}
        data-testid={kind === 'month' ? 'ledger-month' : 'ledger-total'}
        data-month={kind === 'month' ? line.key : undefined}
        aria-current={isMarked ? 'date' : undefined}
        className={cn('max-sm:block max-sm:border-b max-sm:border-rule max-sm:py-3', (isMarked || kind === 'total') && 'max-sm:-mx-5 max-sm:px-5', isMarked && 'bg-accent-tint', kind === 'total' && 'bg-surface-2 font-semibold')}
      >
        <TableHead scope="row" className="border-b border-rule bg-transparent text-body font-semibold text-ink max-sm:block max-sm:border-0 max-sm:px-0 max-sm:py-1">
          {value(line.cells[0])}
          {isMarked ? <span className="ml-2 text-small font-semibold text-accent">{marked.label}</span> : null}
        </TableHead>
        {amountColumns.map((column: ExportColumn, index) => {
          const cell = line.cells[index + 1];
          const zero = cell?.kind === 'vnd' && cell.value === 0;
          return (
            <TableCell
              key={column.id}
              data-column={column.id}
              className={cn(
                'text-end figures whitespace-nowrap max-sm:flex max-sm:justify-between max-sm:gap-4 max-sm:border-0 max-sm:px-0 max-sm:py-0.5',
                zero ? 'text-ink-muted' : 'text-ink',
                column.id === 'noi' && 'font-semibold',
                zero && !ALWAYS_SHOWN.has(column.id) && 'max-sm:hidden',
              )}
            >
              <span aria-hidden="true" className="text-start text-ink-2 sm:hidden">
                {column.label}
              </span>
              {value(cell)}
            </TableCell>
          );
        })}
      </TableRow>
    );
  };

  return (
    <div role="region" aria-label={caption} tabIndex={0} className="max-h-112 overflow-auto rounded-md border border-rule max-sm:max-h-none max-sm:overflow-visible max-sm:rounded-none max-sm:border-0 max-sm:border-t">
      {marked === null ? null : <ScrollIntoView id={ledgerRowId(marked.key)} />}
      <Table className="max-sm:block">
        <caption className="sr-only">{caption}</caption>
        <TableHeader className="max-sm:sr-only">
          <TableRow>
            {table.columns.map((column, index) => (
              <TableHead key={column.id} scope="col" className={cn('sticky top-0 z-10', index > 0 && 'text-end')}>
                {column.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody className="max-sm:block">{table.rows.map((line) => row(line, 'month'))}</TableBody>
        <tfoot className="max-sm:block">{row(table.totals, 'total')}</tfoot>
      </Table>
    </div>
  );
}
