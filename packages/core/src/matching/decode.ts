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

export type RejectedRow =
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

/** RFC 4180 text to a grid: a leading BOM, CRLF, quoted fields and doubled quotes are handled. */
export function decodeCsv(text: string): StatementGrid {
  const body = text.startsWith('﻿') ? text.slice(1) : text;
  const delimiter = detectDelimiter(body.slice(0, body.search(/\r?\n|$/)));
  const grid: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < body.length; i++) {
    const char = body[i] as string;
    if (quoted) {
      if (char === '"' && body[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && body[i + 1] === '\n') i++;
      row.push(field);
      grid.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    grid.push(row);
  }
  return grid;
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

/** The data rows under a detected header. Blank rows are skipped; rows that fail to parse are reported, not dropped. */
export function decodeStatementRows(grid: StatementGrid, header: DetectedHeader): DecodedRows {
  const { headerRow, mapping } = header;
  const rows: StatementRow[] = [];
  const rejected: RejectedRow[] = [];
  for (let index = headerRow + 1; index < grid.length; index++) {
    const cells = grid[index] ?? [];
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

export function decodeStatement(grid: StatementGrid): Result<DecodedStatement, HeaderReason> {
  const header = detectColumnMapping(grid);
  if (!header.ok) return header;
  return { ok: true, value: { ...header.value, ...decodeStatementRows(grid, header.value) } };
}
