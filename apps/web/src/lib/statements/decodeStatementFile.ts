import {
  cellText,
  decodeStatement,
  decodeStatementCsv,
  detectColumnMapping,
  presetHeader,
  type ColumnPreset,
  type DecodedStatement,
  type DetectedHeader,
  type HeaderReason,
  type StatementCell,
  type StatementGrid,
} from '@esta/core/matching';
import { parseCsv } from '@esta/core/parse/csv';
import type { Result } from '@esta/core/result';

/** Far above a year of one account's lines; the server takes at most 5,000 of them. */
export const MAX_STATEMENT_BYTES = 5 * 1024 * 1024;

export type StatementFileReason = 'too_large' | 'unsupported' | 'unreadable';

/**
 * A statement read in the browser: its cells, and core's one decoder over them, with the CSV record checks for a CSV
 * file. `decode()` reads the lines under the header its labels name; `decode(chosen)` under the columns a person chose
 * or a saved preset found again (P3-21).
 */
export type StatementFile = {
  readonly grid: StatementGrid;
  readonly decode: (chosen?: DetectedHeader) => Result<DecodedStatement, HeaderReason>;
};

/**
 * How a file's columns are known: by the labels Esta reads (`detected`), by the account's saved columns found again in
 * its header (`preset`), or not yet, so a person maps them; `mismatch` says the account has saved columns this header
 * does not carry.
 */
export type FileColumns = { readonly kind: 'detected' | 'preset'; readonly header: DetectedHeader } | { readonly kind: 'unknown'; readonly mismatch: boolean };

export function fileColumns(file: StatementFile, preset: ColumnPreset | undefined): FileColumns {
  const detected = detectColumnMapping(file.grid);
  if (detected.ok) return { kind: 'detected', header: detected.value };
  const found = preset === undefined ? undefined : presetHeader(file.grid, preset);
  return found === undefined ? { kind: 'unknown', mismatch: preset !== undefined } : { kind: 'preset', header: found };
}

/** At least a header and one line under it; a file with less has nothing to read or map. */
export const holdsLines = (grid: StatementGrid): boolean => grid.filter((row) => row.some((cell) => cellText(cell) !== '')).length >= 2;

/** The header row's cells as text, stored with the import so the next file from the account can be read under them. */
export const headerCells = (grid: StatementGrid, headerRow: number): string[] => (grid[headerRow] ?? []).map(cellText);

const ZIP = [0x50, 0x4b, 0x03, 0x04];

/** A date cell arrives as text, as the decoder expects; read-excel-file gives it as a UTC midnight `Date`. */
function sheetCell(value: unknown): StatementCell {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'string' || typeof value === 'number') return value;
  return typeof value === 'boolean' ? String(value) : null;
}

async function readSheet(bytes: Uint8Array<ArrayBuffer>): Promise<Result<StatementFile, StatementFileReason>> {
  const { readSheet: read } = await import('read-excel-file/browser');
  const rows = await read(new Blob([bytes])).catch(() => null);
  if (rows === null) return { ok: false, reason: 'unreadable' };
  const grid = rows.map((row) => row.map(sheetCell));
  return { ok: true, value: { grid, decode: (chosen) => decodeStatement(grid, chosen) } };
}

function readText(bytes: Uint8Array): Result<StatementFile, StatementFileReason> {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
  const grid = parseCsv(text, { spanLines: false }).map((record) => (record.ok ? record.value : []));
  return { ok: true, value: { grid, decode: (chosen) => decodeStatementCsv(text, chosen) } };
}

/**
 * A statement file read where it lives, in the browser (LSE-8): an XLSX sheet through read-excel-file, loaded only
 * when one is chosen, or CSV text through core's one CSV entry point. Only the decoded lines go to the server.
 */
export async function decodeStatementFile(bytes: Uint8Array<ArrayBuffer>, name: string): Promise<Result<StatementFile, StatementFileReason>> {
  if (bytes.byteLength > MAX_STATEMENT_BYTES) return { ok: false, reason: 'too_large' };
  if (ZIP.every((byte, index) => bytes[index] === byte)) return readSheet(bytes);
  return name.toLowerCase().endsWith('.csv') ? readText(bytes) : { ok: false, reason: 'unsupported' };
}

export { firstPicks, pickedHeader, picksOf, type Picks, type PicksReason } from './picks';
