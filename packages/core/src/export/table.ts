import type { Vnd } from '../money/vnd';

export type ExportCell = { readonly kind: 'vnd'; readonly value: Vnd } | { readonly kind: 'text'; readonly value: string };
export type ExportColumn = { readonly id: string; readonly label: string };
export type ExportRow = { readonly key: string; readonly cells: readonly ExportCell[] };

/**
 * One table that a screen, a CSV and a spreadsheet all render, so their figures cannot drift. Each row has one cell per
 * column, and `totals` is the last line.
 */
export type ExportTable = { readonly columns: readonly ExportColumn[]; readonly rows: readonly ExportRow[]; readonly totals: ExportRow };

export const text = (value: string): ExportCell => ({ kind: 'text', value: value.normalize('NFC') });
export const amount = (value: Vnd): ExportCell => ({ kind: 'vnd', value });
