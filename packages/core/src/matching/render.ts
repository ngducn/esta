import { dateParts } from '../date/calendar';
import type { IsoDate } from '../date/iso-date';
import type { Vnd } from '../money/vnd';
import type { StatementRow } from './decode';
import type { AmountStyle, DateStyle, StatementCell, StatementGrid, StatementLayout } from './layouts';

export type RenderableRow = Pick<StatementRow, 'date' | 'amount' | 'description' | 'bankRef'>;

function grouped(magnitude: number, separator: string): string {
  return String(magnitude).replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}

/** The magnitude written the way the layout writes it; the sign is the caller's, since split columns carry none. */
export function renderMagnitude(magnitude: number, style: AmountStyle): StatementCell {
  switch (style) {
    case 'dot_grouped':
      return grouped(magnitude, '.');
    case 'comma_grouped_cents':
      return `${grouped(magnitude, ',')}.00`;
    case 'number':
      return magnitude;
  }
}

function signed(amount: Vnd, style: AmountStyle): StatementCell {
  const cell = renderMagnitude(Math.abs(amount), style);
  if (amount >= 0) return cell;
  return typeof cell === 'number' ? -cell : `-${cell}`;
}

export function renderDate(date: IsoDate, style: DateStyle): string {
  const { year, month, day } = dateParts(date);
  const dayFirst = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
  switch (style) {
    case 'dd/MM/yyyy':
      return dayFirst;
    case 'dd/MM/yyyy HH:mm:ss':
      return `${dayFirst} 00:00:00`;
    case 'yyyy-MM-dd':
      return date;
  }
}

function renderCell(row: RenderableRow, column: StatementLayout['columns'][number], layout: StatementLayout): StatementCell {
  switch (column.role) {
    case 'date':
      return renderDate(row.date, layout.dateStyle);
    case 'description':
      return row.description;
    case 'bankRef':
      return row.bankRef;
    case 'amount':
      return signed(row.amount, layout.amountStyle);
    case 'credit':
      return row.amount >= 0 ? renderMagnitude(row.amount, layout.amountStyle) : null;
    case 'debit':
      return row.amount < 0 ? renderMagnitude(-row.amount, layout.amountStyle) : null;
    case 'balance':
      return null;
  }
}

/** A header row followed by one row per statement row, the inverse of `decodeStatement` for this layout. */
export function renderStatementGrid(layout: StatementLayout, rows: readonly RenderableRow[]): StatementGrid {
  const header = layout.columns.map((column) => column.header);
  return [header, ...rows.map((row) => layout.columns.map((column) => renderCell(row, column, layout)))];
}

const NEEDS_QUOTES = /[",\r\n]/;

function csvField(cell: StatementCell): string {
  const text = cell === null ? '' : String(cell);
  return NEEDS_QUOTES.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function renderCsv(grid: StatementGrid): string {
  return grid
    .map((cells) => cells.map(csvField).join(','))
    .join('\r\n')
    .concat('\r\n');
}

export function renderStatementCsv(layout: StatementLayout, rows: readonly RenderableRow[]): string {
  return renderCsv(renderStatementGrid(layout, rows));
}
