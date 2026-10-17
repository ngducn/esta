import { isoDate } from '../date/iso-date';
import { vnd } from '../money/vnd';
import type { RejectedRow } from './decode';
import type { StatementCell, StatementGrid, StatementLayout } from './layouts';
import type { InvoiceCandidate, StatementMatch } from './match';
import { renderDate, renderStatementGrid, type RenderableRow } from './render';

/**
 * One October 2026 statement of the synthetic household Gia đình Demo, written once and rendered
 * into every layout. Each row states the match it must get, so the golden files come from intent,
 * not from running the matcher.
 */
export const SCENARIO_INVOICES: readonly InvoiceCandidate[] = [
  { id: 'inv-dian-p3-202610', memoCode: '7K2QX9MP', tenantName: 'Nguyễn Thị Hường Demo', dueDate: isoDate('2026-10-01'), outstanding: vnd(3_500_000) },
  { id: 'inv-dian-p5-202610', memoCode: 'Q4N8R2TV', tenantName: 'Trần Văn Khoa Demo', dueDate: isoDate('2026-10-01'), outstanding: vnd(4_200_000) },
  { id: 'inv-dian-p7-202610', memoCode: 'B7C3D9EF', tenantName: 'Lê Minh Demo', dueDate: isoDate('2026-10-05'), outstanding: vnd(2_800_000) },
  { id: 'inv-baoloc-nha-202610', memoCode: 'H8J3K7LM', tenantName: 'Phạm Thu Hà Demo', dueDate: isoDate('2026-10-01'), outstanding: vnd(12_000_000) },
  { id: 'inv-dian-p8-202610', memoCode: 'X2Y6Z4WP', tenantName: 'Trần Văn Khoa Demo', dueDate: isoDate('2026-10-01'), outstanding: vnd(4_200_000) },
  { id: 'inv-dian-p1-202609', memoCode: 'N5P9R3SQ', tenantName: 'Hoàng Anh Demo', dueDate: isoDate('2026-09-01'), outstanding: vnd(0) },
];

export type ScenarioRow = RenderableRow & { expect: StatementMatch };

const memoMatch = (invoiceId: string, memoCode: string): StatementMatch => ({ status: 'memo_match', invoiceId, memoCode });
const unmatched = (...candidateIds: string[]): StatementMatch => ({ status: 'unmatched', candidateIds });
const debit: StatementMatch = { status: 'ignored', reason: 'debit' };

const memoWithBankNoise: ScenarioRow = {
  date: isoDate('2026-10-02'),
  amount: vnd(3_500_000),
  bankRef: 'FT26275001',
  description: 'MBVCB.2627501.ESTA7K2QX9MP.CT TU 0903123456 NGUYEN THI HUONG DEMO',
  expect: memoMatch('inv-dian-p3-202610', '7K2QX9MP'),
};

const counterDeposit = { date: isoDate('2026-10-09'), amount: vnd(6_000_000), bankRef: '', description: 'NOP TIEN MAT ESTA H8J3K7LM PHAM THU HA DEMO' };

export const SCENARIO_ROWS: readonly ScenarioRow[] = [
  memoWithBankNoise,
  {
    date: isoDate('2026-10-03'),
    amount: vnd(4_200_000),
    bankRef: 'FT26276002',
    description: 'esta q4n8r2tv tien phong thang 10',
    expect: memoMatch('inv-dian-p5-202610', 'Q4N8R2TV'),
  },
  {
    date: isoDate('2026-10-06'),
    amount: vnd(1_000_000),
    bankRef: 'FT26279003',
    description: 'TRAN VAN KHOA DEMO ESTAX2Y6Z4WP CK MOT PHAN',
    expect: memoMatch('inv-dian-p8-202610', 'X2Y6Z4WP'),
  },
  {
    date: isoDate('2026-10-06'),
    amount: vnd(2_800_000),
    bankRef: 'FT26279004',
    description: 'CAFE FIESTA THANH TOAN',
    expect: unmatched(),
  },
  {
    date: isoDate('2026-10-07'),
    amount: vnd(2_800_000),
    bankRef: 'FT26280005',
    description: 'FIESTAESTAB7C3D9EF LE MINH DEMO',
    expect: memoMatch('inv-dian-p7-202610', 'B7C3D9EF'),
  },
  {
    date: isoDate('2026-10-04'),
    amount: vnd(12_000_000),
    bankRef: 'FT26277006',
    description: 'PHAM THU HA DEMO CHUYEN TIEN THUE NHA',
    expect: { status: 'suggested', invoiceId: 'inv-baoloc-nha-202610' },
  },
  {
    date: isoDate('2026-10-05'),
    amount: vnd(4_200_000),
    bankRef: 'FT26278007',
    description: 'TRAN VAN KHOA DEMO CK',
    expect: unmatched('inv-dian-p5-202610', 'inv-dian-p8-202610'),
  },
  { date: isoDate('2026-10-05'), amount: vnd(-11_000), bankRef: 'FT26278008', description: 'PHI DICH VU SMS BANKING', expect: debit },
  { date: isoDate('2026-10-08'), amount: vnd(-2_000_000), bankRef: 'FT26281009', description: 'RUT TIEN ATM', expect: debit },
  {
    date: isoDate('2026-10-08'),
    amount: vnd(850_000),
    bankRef: 'FT26281010',
    description: 'ESTA ZZZZZZZZ HOANG ANH DEMO',
    expect: unmatched(),
  },
  {
    date: isoDate('2026-10-15'),
    amount: vnd(12_000_000),
    bankRef: 'FT26288011',
    description: 'PHAM THU HA DEMO CHUYEN TIEN',
    expect: unmatched(),
  },
  { ...memoWithBankNoise, expect: { status: 'ignored', reason: 'duplicate' } },
  { ...counterDeposit, expect: memoMatch('inv-baoloc-nha-202610', 'H8J3K7LM') },
  { ...counterDeposit, expect: { status: 'unmatched', candidateIds: ['inv-baoloc-nha-202610'], repeatOf: 13 } },
];

const fractional = { date: isoDate('2026-10-09'), bankRef: 'FT26282013', description: 'LE MINH DEMO NUA DONG' };

const FRACTIONAL_TEXT: Readonly<Record<StatementLayout['amountStyle'], StatementCell>> = {
  dot_grouped: '1.500.000,50',
  comma_grouped_cents: '1,500,000.50',
  number: 1_500_000.5,
};

function fractionalCells(layout: StatementLayout): StatementCell[] {
  return layout.columns.map(({ role }) => {
    switch (role) {
      case 'date':
        return renderDate(fractional.date, layout.dateStyle);
      case 'bankRef':
        return fractional.bankRef;
      case 'description':
        return fractional.description;
      case 'amount':
      case 'credit':
        return FRACTIONAL_TEXT[layout.amountStyle];
      case 'debit':
      case 'balance':
        return null;
    }
  });
}

/** The scenario in one layout, with a half-đồng row at the end that decoding must refuse. */
export function scenarioGrid(layout: StatementLayout): StatementGrid {
  return [...renderStatementGrid(layout, SCENARIO_ROWS), fractionalCells(layout)];
}

export const SCENARIO_REJECTED: readonly RejectedRow[] = [{ index: SCENARIO_ROWS.length + 1, field: 'amount', reason: 'fractional' }];
