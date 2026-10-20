import { cellText, decodeStatement, decodeStatementCsv, type DecodedStatement, type HeaderReason, type StatementCell, type StatementGrid } from '@esta/core/matching';
import { parseCsv } from '@esta/core/parse/csv';
import type { Result } from '@esta/core/result';

/** Far above a year of one account's lines; the server takes at most 5,000 of them. */
export const MAX_STATEMENT_BYTES = 5 * 1024 * 1024;

export type StatementFileReason = HeaderReason | 'too_large' | 'unsupported' | 'unreadable';

/** The decoded lines and the header cells they were read under, which the import stores for the next file from the account. */
export type DecodedStatementFile = DecodedStatement & { readonly header: readonly string[] };

const ZIP = [0x50, 0x4b, 0x03, 0x04];

/** A date cell arrives as text, as the decoder expects; read-excel-file gives it as a UTC midnight `Date`. */
function sheetCell(value: unknown): StatementCell {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'string' || typeof value === 'number') return value;
  return typeof value === 'boolean' ? String(value) : null;
}

function withHeader(decoded: Result<DecodedStatement, HeaderReason>, grid: StatementGrid): Result<DecodedStatementFile, StatementFileReason> {
  if (!decoded.ok) return decoded;
  return { ok: true, value: { ...decoded.value, header: (grid[decoded.value.headerRow] ?? []).map(cellText) } };
}

async function decodeSheet(bytes: Uint8Array<ArrayBuffer>): Promise<Result<DecodedStatementFile, StatementFileReason>> {
  const { readSheet } = await import('read-excel-file/browser');
  const rows = await readSheet(new Blob([bytes])).catch(() => null);
  if (rows === null) return { ok: false, reason: 'unreadable' };
  const grid = rows.map((row) => row.map(sheetCell));
  return withHeader(decodeStatement(grid), grid);
}

function decodeText(bytes: Uint8Array): Result<DecodedStatementFile, StatementFileReason> {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
  const grid = parseCsv(text, { spanLines: false }).map((record) => (record.ok ? record.value : []));
  return withHeader(decodeStatementCsv(text), grid);
}

/**
 * A statement file read where it lives, in the browser (LSE-8): an XLSX sheet through read-excel-file, loaded only
 * when one is chosen, or CSV text through core's one CSV entry point. Only the decoded lines go to the server.
 */
export async function decodeStatementFile(bytes: Uint8Array<ArrayBuffer>, name: string): Promise<Result<DecodedStatementFile, StatementFileReason>> {
  if (bytes.byteLength > MAX_STATEMENT_BYTES) return { ok: false, reason: 'too_large' };
  if (ZIP.every((byte, index) => bytes[index] === byte)) return decodeSheet(bytes);
  return name.toLowerCase().endsWith('.csv') ? decodeText(bytes) : { ok: false, reason: 'unsupported' };
}
