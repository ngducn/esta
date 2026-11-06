import { createHash } from 'node:crypto';
import { publicTable } from './context.ts';
import { householdId } from './households.ts';
import { seedId } from './ids.ts';

const importId = (key: string) => seedId(`seed:statement-import:${key}`);

/** One statement waiting in the preview, so the preview screen has an address the screens pass can open. */
export const statementImports = publicTable('statement_imports', ({ household }) => [
  {
    id: importId(household.key),
    household_id: householdId(household),
    bank_account_id: seedId(`seed:bank-account:${household.key}`),
    file_name: 'Demo-sao-ke-thang-10.csv',
    column_mapping: { headerRow: 0 },
    status: 'parsed',
  },
]);

const LINES = [
  { posted_on: '2026-10-05', amount_vnd: 4_500_000, description: 'CHUYEN TIEN THUE PHONG', bank_ref: 'FT26278000001', status: 'unmatched', reason: null },
  { posted_on: '2026-10-06', amount_vnd: -350_000, description: 'THANH TOAN HOA DON DIEN', bank_ref: 'FT26279000002', status: 'ignored', reason: 'debit' },
] as const;

export const statementRows = publicTable('statement_rows', ({ household }) =>
  LINES.map((line, index) => ({
    id: seedId(`seed:statement-row:${household.key}:${index}`),
    household_id: householdId(household),
    import_id: importId(household.key),
    row_index: index,
    ...line,
    fingerprint: createHash('sha256').update(`seed:statement-fingerprint:${household.key}:${line.bank_ref}`).digest('hex'),
  })),
);
