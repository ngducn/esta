import { describe, expect, it } from 'vitest';
import { isoDate } from '../date/iso-date';
import { vnd } from '../money/vnd';
import { MAX_LIST_RENT_VND } from '../schemas/units';
import { depositActions, depositPrefill, deriveDepositLedger, previewDepositEntry, type DepositEntry, type DepositKind, type DepositState } from './deposits';

function entry(id: string, kind: DepositKind, amount: number, onDate: string): DepositEntry {
  return { id, kind, amountVnd: vnd(amount), onDate: isoDate(onDate) };
}

function held(entries: readonly DepositEntry[]) {
  const result = deriveDepositLedger(entries);
  if (!result.ok) throw new Error(result.reason);
  return { rows: result.value.rows.map((row) => [row.id, row.heldVnd]), heldVnd: result.value.heldVnd };
}

describe('deriveDepositLedger', () => {
  it('holds nothing without entries', () => {
    expect(held([])).toEqual({ rows: [], heldVnd: 0 });
  });

  it('holds what was received', () => {
    expect(held([entry('r', 'received', 3_500_000, '2025-09-15')])).toEqual({ rows: [['r', 3_500_000]], heldVnd: 3_500_000 });
  });

  it('runs the balance through received, applied, deducted and refunded entries', () => {
    const entries = [
      entry('received', 'received', 7_000_000, '2025-01-10'),
      entry('applied', 'applied', 3_500_000, '2026-07-25'),
      entry('deduction', 'deduction', 500_000, '2026-07-29'),
      entry('refunded', 'refunded', 3_000_000, '2026-08-05'),
    ];
    expect(held(entries)).toEqual({
      rows: [
        ['received', 7_000_000],
        ['applied', 3_500_000],
        ['deduction', 3_000_000],
        ['refunded', 0],
      ],
      heldVnd: 0,
    });
  });

  it('orders entries by date and keeps same-day entries in the order given', () => {
    const entries = [
      entry('refund', 'refunded', 1_000_000, '2026-08-05'),
      entry('topup', 'received', 1_000_000, '2026-03-01'),
      entry('first', 'received', 2_000_000, '2026-03-01'),
    ];
    expect(held(entries).rows).toEqual([
      ['topup', 1_000_000],
      ['first', 3_000_000],
      ['refund', 2_000_000],
    ]);
  });

  it.each(['applied', 'deduction', 'refunded'] as const)('refuses %s above the held balance and names the entry', (kind) => {
    const entries = [entry('received', 'received', 3_500_000, '2025-09-15'), entry('over', kind, 3_500_001, '2026-09-20')];
    expect(deriveDepositLedger(entries)).toEqual({ ok: false, reason: 'exceeds_held', entryId: 'over', heldVnd: 3_500_000 });
  });

  it('refuses a refund before anything was received', () => {
    expect(deriveDepositLedger([entry('early', 'refunded', 1, '2026-01-01')])).toEqual({
      ok: false,
      reason: 'exceeds_held',
      entryId: 'early',
      heldVnd: 0,
    });
  });

  it.each([0, -1_000])('refuses an entry of %i', (amount) => {
    expect(deriveDepositLedger([entry('zero', 'received', amount, '2026-01-01')])).toEqual({
      ok: false,
      reason: 'non_positive_amount',
      entryId: 'zero',
    });
  });
});

const state = (heldVnd: number, overrides: Partial<DepositState> = {}): DepositState => ({
  active: false,
  heldVnd: vnd(heldVnd),
  hasEntries: true,
  owesInvoice: false,
  ...overrides,
});

describe('depositActions', () => {
  it('offers Phòng 7 after it ended deduct and refund, and using it on rent only while an invoice owes', () => {
    expect(depositActions(state(2_800_000))).toEqual(['deduction', 'refunded']);
    expect(depositActions(state(2_800_000, { owesInvoice: true }))).toEqual(['applied', 'deduction', 'refunded']);
  });

  it('offers a running lease another receipt, and an ended lease one only while nothing is recorded', () => {
    expect(depositActions(state(0, { active: true }))).toEqual(['received']);
    expect(depositActions(state(0, { hasEntries: false }))).toEqual(['received']);
    expect(depositActions(state(0))).toEqual([]);
  });
});

describe('depositPrefill', () => {
  it('opens a refund with everything held, and a use on rent with what the invoice owes up to what is held', () => {
    expect(depositPrefill('refunded', state(1_200_000), null, null)).toBe(1_200_000);
    expect(depositPrefill('applied', state(2_800_000), null, vnd(1_300_000))).toBe(1_300_000);
    expect(depositPrefill('applied', state(1_000_000), null, vnd(1_300_000))).toBe(1_000_000);
  });

  it('opens a first receipt with the lease deposit, and leaves a deduction or a later receipt empty', () => {
    expect(depositPrefill('received', state(0, { hasEntries: false }), vnd(6_000_000), null)).toBe(6_000_000);
    expect(depositPrefill('received', state(6_000_000), vnd(6_000_000), null)).toBeNull();
    expect(depositPrefill('deduction', state(6_000_000), vnd(6_000_000), null)).toBeNull();
  });
});

describe('previewDepositEntry', () => {
  const ledger = [entry('received', 'received', 2_800_000, '2025-09-16')];

  it('shows the held balance after the entry', () => {
    expect(previewDepositEntry(ledger, entry('new', 'applied', 1_300_000, '2026-10-07'), vnd(1_300_000))).toEqual({ ok: true, heldVnd: 1_500_000 });
    expect(previewDepositEntry(ledger, entry('new', 'received', 500_000, '2026-10-07'), null)).toEqual({ ok: true, heldVnd: 3_300_000 });
  });

  it('refuses using more than the invoice owes, and taking out more than is held at its date', () => {
    expect(previewDepositEntry(ledger, entry('new', 'applied', 1_300_001, '2026-10-07'), vnd(1_300_000))).toEqual({
      ok: false,
      reason: 'exceeds_outstanding',
      limitVnd: 1_300_000,
    });
    expect(previewDepositEntry(ledger, entry('new', 'refunded', 3_000_000, '2026-10-07'), null)).toEqual({ ok: false, reason: 'exceeds_held', limitVnd: 2_800_000 });
    expect(previewDepositEntry(ledger, entry('new', 'refunded', 1, '2025-09-15'), null)).toEqual({ ok: false, reason: 'exceeds_held', limitVnd: 0 });
  });

  it('refuses an amount past the ceiling deposit_entries keeps, before the table would', () => {
    expect(previewDepositEntry(ledger, entry('new', 'received', MAX_LIST_RENT_VND, '2026-10-07'), null)).toEqual({ ok: true, heldVnd: MAX_LIST_RENT_VND + 2_800_000 });
    expect(previewDepositEntry(ledger, entry('new', 'received', MAX_LIST_RENT_VND + 1, '2026-10-07'), null)).toEqual({ ok: false, reason: 'too_large', limitVnd: MAX_LIST_RENT_VND });
    expect(previewDepositEntry(ledger, entry('new', 'refunded', MAX_LIST_RENT_VND + 1, '2026-10-07'), null)).toEqual({ ok: false, reason: 'too_large', limitVnd: MAX_LIST_RENT_VND });
  });
});

/** Ledgers the `deposit_ledger_parity` pgTAP test replays through `lease_deposits` and `deposit_low_point`. */
const LEDGER_CASES: readonly { readonly name: string; readonly entries: readonly DepositEntry[] }[] = [
  { name: 'received only', entries: [entry('1', 'received', 3_500_000, '2025-09-15')] },
  {
    name: 'received then applied deducted and refunded to zero',
    entries: [
      entry('1', 'received', 7_000_000, '2025-01-10'),
      entry('2', 'applied', 3_500_000, '2026-07-25'),
      entry('3', 'deduction', 500_000, '2026-07-29'),
      entry('4', 'refunded', 3_000_000, '2026-08-05'),
    ],
  },
  { name: 'two receipts on one day', entries: [entry('1', 'received', 2_000_000, '2026-03-01'), entry('2', 'received', 1_000_000, '2026-03-01')] },
  { name: 'refund on the day of the receipt', entries: [entry('1', 'received', 2_800_000, '2026-10-01'), entry('2', 'refunded', 2_800_000, '2026-10-01')] },
  { name: 'deduction of the last dong', entries: [entry('1', 'received', 2_800_000, '2025-09-16'), entry('2', 'deduction', 2_800_000, '2026-10-07')] },
  { name: 'refund one dong past the held balance', entries: [entry('1', 'received', 2_800_000, '2025-09-16'), entry('2', 'refunded', 2_800_001, '2026-10-07')] },
  { name: 'refund dated before the receipt', entries: [entry('1', 'received', 2_800_000, '2025-09-16'), entry('2', 'refunded', 100_000, '2025-09-15')] },
  {
    name: 'receipt backdated between two entries',
    entries: [entry('1', 'received', 1_000_000, '2026-03-01'), entry('2', 'refunded', 1_000_000, '2026-03-05'), entry('3', 'received', 2_000_000, '2026-03-03')],
  },
  { name: 'refund written before the receipt on one day', entries: [entry('1', 'refunded', 1_000_000, '2026-03-01'), entry('2', 'received', 1_000_000, '2026-03-01')] },
  { name: 'applied with nothing received', entries: [entry('1', 'applied', 1, '2026-10-07')] },
];

function ledgerCsv(): string {
  const rows = LEDGER_CASES.flatMap(({ name, entries }) => {
    const result = deriveDepositLedger(entries);
    const outcome = result.ok ? String(result.value.heldVnd) : 'refused';
    return entries.map((e) => `${name},${e.id},${e.kind},${e.amountVnd},${e.onDate},${outcome}`);
  });
  return `case,entry,kind,amount_vnd,on_date,outcome\n${rows.join('\n')}\n`;
}

describe('deposit ledger parity vectors', () => {
  it('exports every case with its held balance or refusal for the deposit_ledger_parity test', async () => {
    await expect(ledgerCsv()).toMatchFileSnapshot('../../../../supabase/tests/fixtures/deposit_ledgers.csv');
  });
});
