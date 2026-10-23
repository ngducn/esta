import type { ExportCell, ExportRow, ExportTable } from '@esta/core/export';
import { formatVnd } from '@esta/core/format';
import { getLocale } from 'next-intl/server';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { ScrollIntoView } from './scroll-into-view';

const rowId = (key: string) => `report-row-${key}`;

const NONE: ReadonlySet<string> = new Set();

/**
 * An export table as the screen shows it, so the download and the screen read one table. Amount columns sit right in
 * figures; below 640 px each row stacks under its first cell, with every other cell beside its column label.
 */
export async function ReportTable({
  table,
  caption,
  marked = null,
  optional = NONE,
  strong,
}: {
  table: ExportTable;
  caption: string;
  /** A row marked with a label and scrolled into view. */
  marked?: { key: string; label: string } | null;
  /** Columns whose zero amounts a phone leaves out. */
  optional?: ReadonlySet<string>;
  /** The column that carries each row's result, in bold. */
  strong?: string;
}) {
  const locale = await getLocale();
  const value = (cell: ExportCell | undefined) => (cell === undefined ? '' : cell.kind === 'vnd' ? formatVnd(cell.value, locale) : cell.value);
  const amount = table.columns.map((_, index) => table.totals.cells[index]?.kind === 'vnd');
  const rest = table.columns.slice(1);

  const row = (line: ExportRow, kind: 'row' | 'total') => {
    const isMarked = marked?.key === line.key;
    return (
      <TableRow
        key={line.key}
        id={kind === 'row' ? rowId(line.key) : undefined}
        data-testid={`report-${kind}`}
        data-key={line.key}
        aria-current={isMarked ? 'date' : undefined}
        className={cn('max-sm:block max-sm:border-b max-sm:border-rule max-sm:py-3', (isMarked || kind === 'total') && 'max-sm:-mx-5 max-sm:px-5', isMarked && 'bg-accent-tint', kind === 'total' && 'bg-surface-2 font-semibold')}
      >
        <TableHead scope="row" className="border-b border-rule bg-transparent align-top text-body font-semibold whitespace-normal text-ink max-sm:block max-sm:border-0 max-sm:px-0 max-sm:py-1">
          {value(line.cells[0])}
          {isMarked ? <span className="ml-2 text-small font-semibold text-accent">{marked.label}</span> : null}
        </TableHead>
        {rest.map((column, index) => {
          const cell = line.cells[index + 1];
          const zero = cell?.kind === 'vnd' && cell.value === 0;
          return (
            <TableCell
              key={column.id}
              data-column={column.id}
              className={cn(
                'figures align-top max-sm:flex max-sm:justify-between max-sm:gap-4 max-sm:border-0 max-sm:px-0 max-sm:py-0.5',
                amount[index + 1] ? 'text-end whitespace-nowrap' : 'text-start',
                zero ? 'text-ink-muted' : 'text-ink',
                column.id === strong && 'font-semibold',
                ((zero && optional.has(column.id)) || (cell?.kind === 'text' && cell.value === '')) && 'max-sm:hidden',
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
      {marked === null ? null : <ScrollIntoView id={rowId(marked.key)} />}
      <Table className="max-sm:block">
        <caption className="sr-only">{caption}</caption>
        <TableHeader className="max-sm:sr-only">
          <TableRow>
            {table.columns.map((column, index) => (
              <TableHead key={column.id} scope="col" className={cn('sticky top-0 z-10 whitespace-normal', amount[index] && 'text-end')}>
                {column.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody className="max-sm:block">{table.rows.map((line) => row(line, 'row'))}</TableBody>
        <tfoot className="sticky bottom-0 z-10 max-sm:static max-sm:block">{row(table.totals, 'total')}</tfoot>
      </Table>
    </div>
  );
}
