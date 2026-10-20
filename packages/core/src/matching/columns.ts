import type { Result } from '../result';
import { cellText } from './decode';
import { foldHeader, headerRole, HEADER_SCAN_ROWS, type ColumnMapping, type ColumnRole, type DetectedHeader, type StatementCell, type StatementGrid } from './layouts';

/** The columns an import was read under, as it stores them for the next file from the same account (LSE-8 preset). */
export type ColumnPreset = DetectedHeader & { readonly header: readonly string[] };

/** `same_column` names one column for two roles; `no_column` names a column the header row does not have. */
export type MappingReason = 'same_column' | 'no_column';

function roleColumns(mapping: ColumnMapping): number[] {
  const amount = mapping.amount.kind === 'signed' ? [mapping.amount.amount] : [mapping.amount.credit, mapping.amount.debit];
  return [mapping.date, mapping.description, ...(mapping.bankRef === null ? [] : [mapping.bankRef]), ...amount];
}

/**
 * The header a person chose for a file whose labels Esta does not know, checked against the file: the header row is
 * one of the rows a bank prints first, every column is one of that row's, and no column serves two roles. The result
 * is what `decodeStatement` and `decodeStatementCsv` read the lines under.
 */
export function chosenHeader(grid: StatementGrid, chosen: DetectedHeader): Result<DetectedHeader, MappingReason> {
  const width = grid[chosen.headerRow]?.length ?? 0;
  const columns = roleColumns(chosen.mapping);
  if (chosen.headerRow < 0 || chosen.headerRow >= HEADER_SCAN_ROWS || columns.some((column) => !Number.isInteger(column) || column < 0 || column >= width)) {
    return { ok: false, reason: 'no_column' };
  }
  if (new Set(columns).size !== columns.length) return { ok: false, reason: 'same_column' };
  return { ok: true, value: chosen };
}

/**
 * A preset found again in a new file: the first of its first rows whose cell in each role's column carries the label
 * the preset read there, after `foldHeader`. A file whose bank renamed, moved or dropped one of those columns has no
 * such row, so it is mapped again rather than read under the wrong columns.
 */
export function presetHeader(grid: StatementGrid, preset: ColumnPreset): DetectedHeader | undefined {
  const columns = roleColumns(preset.mapping);
  const labels = columns.map((column) => foldHeader(preset.header[column] ?? ''));
  if (labels.every((label) => label === '')) return undefined;
  const fits = (row: readonly StatementCell[]) => columns.every((column, i) => foldHeader(cellText(row[column])) === labels[i]);
  const headerRow = grid.slice(0, HEADER_SCAN_ROWS).findIndex(fits);
  return headerRow === -1 ? undefined : { headerRow, mapping: preset.mapping };
}

const filled = (row: readonly StatementCell[] | undefined) => (row ?? []).filter((cell) => cellText(cell) !== '').length;

/** The likeliest header row: the first of the first rows with the most filled cells, since a bank's lines above it fill fewer. */
export function guessHeaderRow(grid: StatementGrid): number {
  const rows = grid.slice(0, HEADER_SCAN_ROWS);
  const most = Math.max(0, ...rows.map(filled));
  return Math.max(0, rows.findIndex((row) => filled(row) === most));
}

/** For each role, the column of a header row whose label names it, or else the column holding the label a preset used for it. */
export function guessColumns(cells: readonly StatementCell[], preset?: ColumnPreset): Partial<Record<ColumnRole, number>> {
  const guessed: Partial<Record<ColumnRole, number>> = {};
  cells.forEach((cell, column) => {
    const role = headerRole(cell);
    if (role !== undefined && guessed[role] === undefined) guessed[role] = column;
  });
  if (preset === undefined) return guessed;
  const { mapping, header } = preset;
  const amount: Partial<Record<ColumnRole, number>> = mapping.amount.kind === 'signed' ? { amount: mapping.amount.amount } : { credit: mapping.amount.credit, debit: mapping.amount.debit };
  const used: Partial<Record<ColumnRole, number>> = { date: mapping.date, description: mapping.description, ...(mapping.bankRef === null ? {} : { bankRef: mapping.bankRef }), ...amount };
  for (const [role, presetColumn] of Object.entries(used) as [ColumnRole, number][]) {
    const label = foldHeader(header[presetColumn] ?? '');
    const column = label === '' ? -1 : cells.findIndex((cell) => foldHeader(cellText(cell)) === label);
    if (guessed[role] === undefined && column !== -1) guessed[role] = column;
  }
  return guessed;
}
