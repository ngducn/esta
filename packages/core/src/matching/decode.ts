import type { IsoDate } from '../date/iso-date';
import { vnd, type Vnd } from '../money/vnd';
import type { AmountReason } from '../parse/decimal';
import type { DateInputReason } from '../parse/date-input';
import { parseStatementAmount, parseStatementDate } from '../parse/statement';
import type { Result } from '../result';
import {
  detectColumnMapping,
  type ColumnMapping,
  type DetectedHeader,
  type HeaderReason,
  type StatementCell,
  type StatementGrid,
} from './layouts';

export type StatementRow = {
  /** Zero-based row index in the grid, so a refusal can point at the line in the file. */
  index: number;
  date: IsoDate;
  /** Money in is positive, money out is negative. */
  amount: Vnd;
  description: string;
  bankRef: string;
};

export type AmountRefusal = AmountReason | 'credit_and_debit';

/** A CSV record that cannot be split into cells with certainty. */
export type CsvReason = 'stray_quote' | 'unterminated_quote';
/** A `row` refusal covers the record as a whole: a malformed CSV record, or one whose cell count differs from the header. */
export type RowRefusal = CsvReason | 'cell_count';

export type RejectedRow =
  | { index: number; field: 'row'; reason: RowRefusal }
  | { index: number; field: 'date'; reason: DateInputReason }
  | { index: number; field: 'amount'; reason: AmountRefusal };

export type DecodedRows = { rows: StatementRow[]; rejected: RejectedRow[] };
export type DecodedStatement = DetectedHeader & DecodedRows;

export function cellText(cell: StatementCell | undefined): string {
  if (cell === null || cell === undefined) return '';
  return typeof cell === 'number' ? String(cell) : cell.trim();
}

const DELIMITERS = [',', ';', '\t'] as const;

function detectDelimiter(firstLine: string): string {
  let best: string = DELIMITERS[0];
  let bestCount = -1;
  for (const delimiter of DELIMITERS) {
    const count = firstLine.split(delimiter).length - 1;
    if (count > bestCount) [best, bestCount] = [delimiter, count];
  }
  return best;
}

export type CsvRecord = Result<string[], CsvReason>;

const isLineEnd = (char: string | undefined): boolean => char === '\n' || char === '\r';

function afterLineEnd(body: string, at: number): number {
  return body[at] === '\r' && body[at + 1] === '\n' ? at + 2 : at + 1;
}

/** The index of the quote that closes a quoted field opened just before `from`, or -1. */
function closingQuote(body: string, from: number): number {
  for (let at = from; at < body.length; at++) {
    if (body[at] !== '"') continue;
    if (body[at + 1] !== '"') return at;
    at++;
  }
  return -1;
}

function readRecord(body: string, start: number, delimiter: string): { record: CsvRecord; next: number } {
  const cells: string[] = [];
  let stray = false;
  let at = start;
  for (;;) {
    let field = '';
    if (body[at] === '"') {
      const close = closingQuote(body, at + 1);
      if (close === -1) {
        const lineEnd = body.slice(at).search(/[\r\n]/);
        return { record: { ok: false, reason: 'unterminated_quote' }, next: lineEnd === -1 ? body.length : afterLineEnd(body, at + lineEnd) };
      }
      field = body.slice(at + 1, close).replaceAll('""', '"');
      at = close + 1;
      if (at < body.length && body[at] !== delimiter && !isLineEnd(body[at])) stray = true;
    }
    for (; at < body.length && body[at] !== delimiter && !isLineEnd(body[at]); at++) {
      if (body[at] === '"') stray = true;
      field += body[at];
    }
    cells.push(field);
    if (body[at] === delimiter) {
      at++;
      continue;
    }
    return { record: stray ? { ok: false, reason: 'stray_quote' } : { ok: true, value: cells }, next: afterLineEnd(body, at) };
  }
}

/**
 * RFC 4180 text to records: a leading BOM, CRLF, quoted fields and doubled quotes are handled. A
 * quote opens a field only at its start. A record with a quote anywhere else, or whose quote never
 * closes, is refused and reading resumes on the next line, so one bad record costs one row.
 */
export function decodeCsv(text: string): CsvRecord[] {
  const body = text.startsWith('\uFEFF') ? text.slice(1) : text;
  const delimiter = detectDelimiter(body.slice(0, body.search(/\r?\n|$/)));
  const records: CsvRecord[] = [];
  for (let at = 0; at < body.length; ) {
    const { record, next } = readRecord(body, at, delimiter);
    records.push(record);
    at = next;
  }
  return records;
}

function splitAmount(creditText: string, debitText: string): Result<Vnd, AmountRefusal> {
  const credit = creditText === '' ? null : parseStatementAmount(creditText);
  const debit = debitText === '' ? null : parseStatementAmount(debitText);
  if (credit === null && debit === null) return { ok: false, reason: 'empty' };
  if (credit !== null && !credit.ok) return credit;
  if (debit !== null && !debit.ok) return debit;
  const creditValue = credit?.ok ? credit.value : 0;
  const debitValue = debit?.ok ? debit.value : 0;
  if (creditValue !== 0 && debitValue !== 0) return { ok: false, reason: 'credit_and_debit' };
  return { ok: true, value: vnd(creditValue !== 0 ? creditValue : -Math.abs(debitValue)) };
}

function rowAmount(cells: readonly StatementCell[], mapping: ColumnMapping): Result<Vnd, AmountRefusal> {
  const columns = mapping.amount;
  if (columns.kind === 'signed') return parseStatementAmount(cellText(cells[columns.amount]));
  return splitAmount(cellText(cells[columns.credit]), cellText(cells[columns.debit]));
}

function isBlank(cells: readonly StatementCell[]): boolean {
  return cells.every((cell) => cellText(cell) === '');
}

type RowCheck = (index: number, cells: readonly StatementCell[]) => RowRefusal | undefined;

function decodeRows(grid: StatementGrid, header: DetectedHeader, check: RowCheck): DecodedRows {
  const { headerRow, mapping } = header;
  const rows: StatementRow[] = [];
  const rejected: RejectedRow[] = [];
  for (let index = headerRow + 1; index < grid.length; index++) {
    const cells = grid[index] ?? [];
    const refusal = check(index, cells);
    if (refusal !== undefined) {
      rejected.push({ index, field: 'row', reason: refusal });
      continue;
    }
    if (isBlank(cells)) continue;
    const date = parseStatementDate(cellText(cells[mapping.date]));
    if (!date.ok) {
      rejected.push({ index, field: 'date', reason: date.reason });
      continue;
    }
    const amount = rowAmount(cells, mapping);
    if (!amount.ok) {
      rejected.push({ index, field: 'amount', reason: amount.reason });
      continue;
    }
    rows.push({
      index,
      date: date.value,
      amount: amount.value,
      description: cellText(cells[mapping.description]),
      bankRef: mapping.bankRef === null ? '' : cellText(cells[mapping.bankRef]),
    });
  }
  return { rows, rejected };
}

/** The data rows of a sheet under a detected header. Blank rows are skipped; rows that fail to parse are reported, not dropped. */
export function decodeStatementRows(grid: StatementGrid, header: DetectedHeader): DecodedRows {
  return decodeRows(grid, header, () => undefined);
}

export function decodeStatement(grid: StatementGrid): Result<DecodedStatement, HeaderReason> {
  const header = detectColumnMapping(grid);
  if (!header.ok) return header;
  return { ok: true, value: { ...header.value, ...decodeStatementRows(grid, header.value) } };
}

/**
 * A CSV statement decoded like a sheet. Besides the sheet refusals, a malformed record under the
 * header, or one with more or fewer cells than the header, is refused as a row: an unquoted
 * `1,500,000` in a comma file splits into extra cells and would otherwise read as 1.
 */
export function decodeStatementCsv(text: string): Result<DecodedStatement, HeaderReason> {
  const records = decodeCsv(text);
  const grid = records.map((record) => (record.ok ? record.value : []));
  const header = detectColumnMapping(grid);
  if (!header.ok) return header;
  const width = grid[header.value.headerRow]?.length;
  const check: RowCheck = (index, cells) => {
    const record = records[index];
    if (record !== undefined && !record.ok) return record.reason;
    return isBlank(cells) || cells.length === width ? undefined : 'cell_count';
  };
  return { ok: true, value: { ...header.value, ...decodeRows(grid, header.value, check) } };
}
