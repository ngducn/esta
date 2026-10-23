import type { Vnd } from '../money/vnd';

export type ExportCell = { readonly kind: 'vnd'; readonly value: Vnd } | { readonly kind: 'text'; readonly value: string };
export type ExportColumn = { readonly id: string; readonly label: string };
export type ExportRow = { readonly key: string; readonly cells: readonly ExportCell[] };

/** Each row, `totals` included, has one cell per column. */
export type ExportTable = { readonly columns: readonly ExportColumn[]; readonly rows: readonly ExportRow[]; readonly totals: ExportRow };

export const textCell = (value: string): ExportCell => ({ kind: 'text', value: value.normalize('NFC') });
export const vndCell = (value: Vnd): ExportCell => ({ kind: 'vnd', value });
