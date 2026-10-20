import type { Result } from '../result';
import { foldVietnamese } from '../search/fold';

/** One sheet cell as a CSV reader or an XLSX reader hands it over. Dates must arrive as text. */
export type StatementCell = string | number | null;
export type StatementGrid = readonly (readonly StatementCell[])[];

export type ColumnRole = 'date' | 'description' | 'bankRef' | 'amount' | 'credit' | 'debit' | 'balance';

/** Header labels each role goes by in Vietnamese and ASCII exports, in `foldHeader` form. */
export const HEADER_ALIASES: Readonly<Record<ColumnRole, readonly string[]>> = {
  date: ['ngay giao dich', 'ngay gd', 'ngay', 'ngay hieu luc', 'ngay hach toan', 'transaction date', 'txn date', 'date', 'value date'],
  description: ['noi dung', 'noi dung giao dich', 'dien giai', 'mo ta', 'description', 'transaction description', 'narrative', 'remark', 'details'],
  bankRef: ['so tham chieu', 'ma giao dich', 'so but toan', 'so giao dich', 'reference', 'ref no', 'ref', 'transaction id', 'transaction no'],
  amount: ['so tien', 'so tien giao dich', 'amount', 'transaction amount'],
  credit: ['ghi co', 'tien vao', 'phat sinh co', 'so tien ghi co', 'credit', 'credit amount', 'money in'],
  debit: ['ghi no', 'tien ra', 'phat sinh no', 'so tien ghi no', 'debit', 'debit amount', 'money out'],
  balance: ['so du', 'so du cuoi', 'balance', 'running balance', 'closing balance'],
};

const TRAILING_CURRENCY = /\s+(?:vnd|dong|d)$/;

export function foldHeader(text: string): string {
  return foldVietnamese(text)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(TRAILING_CURRENCY, '');
}

const ROLE_BY_ALIAS: ReadonlyMap<string, ColumnRole> = new Map(
  (Object.entries(HEADER_ALIASES) as [ColumnRole, readonly string[]][]).flatMap(([role, aliases]) =>
    aliases.map((alias) => [alias, role] as const),
  ),
);

export function headerRole(cell: StatementCell): ColumnRole | undefined {
  return typeof cell === 'string' ? ROLE_BY_ALIAS.get(foldHeader(cell)) : undefined;
}

export type AmountColumns = { kind: 'signed'; amount: number } | { kind: 'split'; credit: number; debit: number };

/** Zero-based column indexes of the roles a statement needs. */
export type ColumnMapping = {
  date: number;
  description: number;
  bankRef: number | null;
  amount: AmountColumns;
};

export type DetectedHeader = { headerRow: number; mapping: ColumnMapping };
export type HeaderReason = 'no_header';

function mappingFromRow(row: readonly StatementCell[]): ColumnMapping | undefined {
  const columns = new Map<ColumnRole, number>();
  row.forEach((cell, index) => {
    const role = headerRole(cell);
    if (role !== undefined && !columns.has(role)) columns.set(role, index);
  });
  const date = columns.get('date');
  const description = columns.get('description');
  const amount = columns.get('amount');
  const credit = columns.get('credit');
  const debit = columns.get('debit');
  if (date === undefined || description === undefined) return undefined;
  const amountColumns: AmountColumns | undefined =
    amount !== undefined
      ? { kind: 'signed', amount }
      : credit !== undefined && debit !== undefined
        ? { kind: 'split', credit, debit }
        : undefined;
  if (amountColumns === undefined) return undefined;
  return { date, description, bankRef: columns.get('bankRef') ?? null, amount: amountColumns };
}

/** How far down a file its header row may sit, under the account lines a bank prints first. */
export const HEADER_SCAN_ROWS = 20;

/** The first row within `scanRows` that names a date, a description and an amount or a credit and debit pair. */
export function detectColumnMapping(grid: StatementGrid, scanRows = HEADER_SCAN_ROWS): Result<DetectedHeader, HeaderReason> {
  for (let headerRow = 0; headerRow < Math.min(scanRows, grid.length); headerRow++) {
    const mapping = mappingFromRow(grid[headerRow] ?? []);
    if (mapping !== undefined) return { ok: true, value: { headerRow, mapping } };
  }
  return { ok: false, reason: 'no_header' };
}

export type AmountStyle = 'dot_grouped' | 'comma_grouped_cents' | 'number';
export type DateStyle = 'dd/MM/yyyy' | 'dd/MM/yyyy HH:mm:ss' | 'yyyy-MM-dd';

/** How one bank writes its export: the header labels in column order and the cell styles. */
export type StatementLayout = {
  id: string;
  columns: readonly { role: ColumnRole; header: string }[];
  amountStyle: AmountStyle;
  dateStyle: DateStyle;
};

/** The three export shapes DOMAIN-VN §9 names, used by the fixtures and the north-star statement template. */
export const STATEMENT_LAYOUTS = {
  a: {
    id: 'a',
    columns: [
      { role: 'date', header: 'Ngày giao dịch' },
      { role: 'bankRef', header: 'Số tham chiếu' },
      { role: 'amount', header: 'Số tiền (VND)' },
      { role: 'description', header: 'Nội dung' },
    ],
    amountStyle: 'dot_grouped',
    dateStyle: 'dd/MM/yyyy HH:mm:ss',
  },
  b: {
    id: 'b',
    columns: [
      { role: 'date', header: 'Ngày GD' },
      { role: 'bankRef', header: 'Mã giao dịch' },
      { role: 'debit', header: 'Ghi nợ' },
      { role: 'credit', header: 'Ghi có' },
      { role: 'balance', header: 'Số dư' },
      { role: 'description', header: 'Diễn giải' },
    ],
    amountStyle: 'number',
    dateStyle: 'dd/MM/yyyy',
  },
  c: {
    id: 'c',
    columns: [
      { role: 'date', header: 'Date' },
      { role: 'bankRef', header: 'Reference' },
      { role: 'amount', header: 'Amount' },
      { role: 'description', header: 'Description' },
    ],
    amountStyle: 'comma_grouped_cents',
    dateStyle: 'yyyy-MM-dd',
  },
} as const satisfies Record<string, StatementLayout>;

export type StatementLayoutId = keyof typeof STATEMENT_LAYOUTS;
