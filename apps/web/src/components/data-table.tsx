'use client';

import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

export type DataColumn<Row> = {
  id: string;
  header: string;
  cell: (row: Row) => ReactNode;
  /** Right-aligned in figures; on a phone it moves to the right end of the row's first line. */
  amount?: boolean;
};

type DataTableProps<Row> = {
  caption: string;
  columns: readonly DataColumn<Row>[];
  rows: readonly Row[];
  rowId: (row: Row) => string;
  /** Names the row in its checkbox label, for example `Chọn Phòng 3`. */
  rowLabel: (row: Row) => string;
  selectable?: boolean;
  onSelectionChange?: (ids: ReadonlySet<string>) => void;
  empty?: ReactNode;
};

type Placement = 'primary' | 'amount' | 'detail';

/** Below 640 px each row stacks: checkbox, then the first column with the amount on its right, then the rest. */
const stacked: Record<Placement, (selectable: boolean) => string> = {
  primary: (selectable) => (selectable ? 'max-sm:col-start-2 max-sm:row-start-1' : 'max-sm:col-start-1 max-sm:row-start-1'),
  amount: (selectable) => (selectable ? 'max-sm:col-start-3 max-sm:row-start-1' : 'max-sm:col-start-2 max-sm:row-start-1'),
  detail: (selectable) => (selectable ? 'max-sm:col-span-2 max-sm:col-start-2' : 'max-sm:col-span-2 max-sm:col-start-1'),
};

function placementOf<Row>(column: DataColumn<Row>, index: number, columns: readonly DataColumn<Row>[]): Placement {
  if (column.amount) return 'amount';
  return columns.findIndex((candidate) => !candidate.amount) === index ? 'primary' : 'detail';
}

export function DataTable<Row>({
  caption,
  columns,
  rows,
  rowId,
  rowLabel,
  selectable = false,
  onSelectionChange,
  empty,
}: DataTableProps<Row>) {
  const t = useTranslations('components.table');
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  const select = (next: ReadonlySet<string>) => {
    setSelected(next);
    onSelectionChange?.(next);
  };
  const allIds = rows.map(rowId);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const someSelected = !allSelected && allIds.some((id) => selected.has(id));

  if (rows.length === 0 && empty !== undefined) return <>{empty}</>;

  return (
    <div className="flex flex-col">
      {selectable ? (
        <div className="flex min-h-touch flex-wrap items-center justify-between gap-x-4 border-b border-rule">
          <label className="-ml-2.5 inline-flex cursor-pointer items-center pr-2 text-body text-ink">
            <Checkbox
              checked={allSelected}
              indeterminate={someSelected}
              onCheckedChange={(checked) => select(checked ? new Set(allIds) : new Set())}
            />
            {t('selectAll')}
          </label>
          <p aria-live="polite" data-testid="selection-count" className="text-body font-semibold text-ink">
            {selected.size > 0 ? t('selected', { count: selected.size }) : null}
          </p>
        </div>
      ) : null}
      <div role="region" aria-label={caption} tabIndex={0} data-slot="table-scroll" className="max-h-112 overflow-auto">
        <Table className="max-sm:block">
          <caption className="sr-only">{caption}</caption>
          <TableHeader className="max-sm:sr-only">
            <TableRow>
              {selectable ? (
                <TableHead className="sticky top-0 z-10 w-touch px-0">
                  <span className="sr-only">{t('selectColumn')}</span>
                </TableHead>
              ) : null}
              {columns.map((column) => (
                <TableHead key={column.id} scope="col" className={cn('sticky top-0 z-10', column.amount && 'text-end')}>
                  {column.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody className="max-sm:block">
            {rows.map((row) => {
              const id = rowId(row);
              const isSelected = selected.has(id);
              return (
                <TableRow
                  key={id}
                  data-selected={isSelected || undefined}
                  className={cn(
                    'data-selected:bg-rule/50',
                    'max-sm:grid max-sm:items-center max-sm:gap-x-3 max-sm:gap-y-0.5 max-sm:border-b max-sm:border-rule max-sm:py-2',
                    selectable ? 'max-sm:grid-cols-[auto_1fr_auto]' : 'max-sm:grid-cols-[1fr_auto]',
                  )}
                >
                  {selectable ? (
                    <TableCell className="w-touch px-0 py-0 max-sm:col-start-1 max-sm:row-span-2 max-sm:row-start-1 max-sm:border-0">
                      <Checkbox
                        checked={isSelected}
                        aria-label={t('selectRow', { name: rowLabel(row) })}
                        onCheckedChange={(checked) => {
                          const next = new Set(selected);
                          if (checked) next.add(id);
                          else next.delete(id);
                          select(next);
                        }}
                      />
                    </TableCell>
                  ) : null}
                  {columns.map((column, index) => {
                    const placement = placementOf(column, index, columns);
                    return (
                      <TableCell
                        key={column.id}
                        className={cn(
                          'max-sm:border-0 max-sm:p-0',
                          stacked[placement](selectable),
                          placement === 'amount' && 'text-end font-figure whitespace-nowrap figures',
                          placement === 'primary' && 'max-sm:font-semibold',
                          placement === 'detail' && 'max-sm:text-small max-sm:text-ink-muted',
                        )}
                      >
                        {placement === 'detail' ? <span className="sm:hidden">{column.header}: </span> : null}
                        {column.cell(row)}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
