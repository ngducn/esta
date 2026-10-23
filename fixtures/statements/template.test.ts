import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isoDate } from '../../packages/core/src/date/iso-date.ts';
import { decodeStatementCsv } from '../../packages/core/src/matching/decode.ts';
import { planImport } from '../../packages/core/src/matching/import.ts';
import { vnd } from '../../packages/core/src/money/vnd.ts';
import { statementFromTemplate, type TemplateBill } from './template.ts';

const template = readFileSync(join(import.meta.dirname, 'northstar-template.csv'), 'utf8');

// North-star step 4 on 2026-10-07: Dãy trọ Dĩ An's six October bills, due 01/10/2026.
const TENANTS = ['Nguyễn Văn An Demo', 'Trần Thị Bình Demo', 'Lê Văn Cường Demo', 'Võ Thị Dung Demo', 'Hoàng Văn Em Demo', 'Đặng Thị Giang Demo'];
const BILLS = TENANTS.map((tenantName, i) => ({
  id: `bill-${i + 1}`,
  number: `DIAN-202610-00${i + 1}`,
  memoCode: ['7K2QX9MP', 'Q4N8R2TV', 'X2Y6Z4WP', 'CMDEMC2T', '8J6R6558', '257468QP'][i] ?? '',
  tenantName,
  dueDate: isoDate('2026-10-01'),
  outstanding: vnd(i % 2 === 0 ? 2_500_000 : 2_800_000),
  status: 'issued' as const,
}));

function imported(bills: readonly TemplateBill[]) {
  const decoded = decodeStatementCsv(statementFromTemplate(template, bills));
  if (!decoded.ok) throw new Error(decoded.reason);
  return planImport(decoded.value.rows, BILLS, []).rows.map((row) => ({ status: row.status, bill: row.invoiceId }));
}

describe('statementFromTemplate', () => {
  it('fills the north-star template so three lines post by memo code, one waits as a suggestion and FIESTA and the debits do not', () => {
    expect(imported(BILLS)).toEqual([
      { status: 'memo_match', bill: 'bill-1' },
      { status: 'memo_match', bill: 'bill-2' },
      { status: 'suggested', bill: 'bill-4' },
      { status: 'memo_match', bill: 'bill-3' },
      { status: 'unmatched', bill: null },
      { status: 'ignored', bill: null },
      { status: 'ignored', bill: null },
    ]);
  });

  it('writes amounts as layout A does and names tenants as a bank prints them', () => {
    const filled = statementFromTemplate(template, BILLS);
    expect(filled).toContain('2.800.000,esta Q4N8R2TV tien phong thang 10');
    expect(filled).toContain('VO THI DUNG DEMO CHUYEN TIEN THUE PHONG');
    expect(filled).not.toMatch(/\{(memo|amount|tenant):\d+\}/);
  });

  it('refuses a template that names a bill it was not given', () => {
    expect(() => statementFromTemplate(template, BILLS.slice(0, 4))).toThrow('names bill 5, but only 4 were given');
  });
});
