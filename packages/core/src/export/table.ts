import type { Vnd } from '../money/vnd';

export type ExportCell =
  | { readonly kind: 'vnd'; readonly value: Vnd }
  /** A whole number that is not money, such as a count of days. */
  | { readonly kind: 'count'; readonly value: number }
  | { readonly kind: 'text'; readonly value: string };
export type ExportColumn = { readonly id: string; readonly label: string };
export type ExportRow = { readonly key: string; readonly cells: readonly ExportCell[] };

/** Each row, `totals` included, has one cell per column. */
export type ExportTable = { readonly columns: readonly ExportColumn[]; readonly rows: readonly ExportRow[]; readonly totals: ExportRow };

export const textCell = (value: string): ExportCell => ({ kind: 'text', value: value.normalize('NFC') });
export const vndCell = (value: Vnd): ExportCell => ({ kind: 'vnd', value });
export const countCell = (value: number): ExportCell => ({ kind: 'count', value });

/** The number a vnd or count cell holds; `null` for text. */
export const numberOf = (cell: ExportCell | undefined): number | null => (cell === undefined || cell.kind === 'text' ? null : cell.value);
