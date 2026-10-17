import {
  allocatePayment,
  deriveDepositLedger,
  derivePaymentStatus,
  type Allocation,
  type DepositEntry,
  type DepositKind,
  type OpenInvoice,
  type PaymentStatus,
} from '@esta/core/allocation';
import { isoDate } from '@esta/core/date';
import { formatDate, formatVnd, type Locale } from '@esta/core/format';
import { vnd } from '@esta/core/money';
import { getLocale, getTranslations } from 'next-intl/server';

type Invoice = { number: string; dueDate: string; totalVnd: number };

type Payment = { transfer: number; amountVnd: number; override?: readonly [string, number][] };

type Refused = { refused: string; heldVnd?: number };

type Outcome = { allocatedVnd: number | null; outstandingVnd: number | null; status: PaymentStatus | '' | Refused };

type AllocationExample = {
  id: string;
  label: 'oldestFirst' | 'twoTransfers' | 'overpay' | 'override' | 'overdue';
  invoices: readonly Invoice[];
  payments: readonly Payment[];
  /** One entry per invoice, then the credit, for every payment; one per invoice when there is no payment. */
  expected: readonly Outcome[];
};

type DepositExample = {
  id: string;
  label: 'phong7' | 'bienHoa';
  entries: readonly [string, DepositKind, number][];
  expected: readonly (number | Refused)[];
};

const SEP = { number: 'di-an-202609-03', dueDate: '2026-09-25', totalVnd: 3_500_000 };
const OCT = { number: 'di-an-202610-03', dueDate: '2026-10-25', totalVnd: 3_500_000 };
const AUG_6 = { number: 'di-an-202608-06', dueDate: '2026-08-25', totalVnd: 3_500_000 };
const SEP_6 = { number: 'di-an-202609-06', dueDate: '2026-09-25', totalVnd: 3_500_000 };

const credit = (amount: number): Outcome => ({ allocatedVnd: amount, outstandingVnd: null, status: '' });

const ALLOCATION_EXAMPLES: readonly AllocationExample[] = [
  {
    id: 'oldest-first',
    label: 'oldestFirst',
    invoices: [OCT, SEP],
    payments: [{ transfer: 1, amountVnd: 5_000_000 }],
    expected: [
      { allocatedVnd: 3_500_000, outstandingVnd: 0, status: 'paid' },
      { allocatedVnd: 1_500_000, outstandingVnd: 2_000_000, status: 'partial' },
      credit(0),
    ],
  },
  {
    id: 'two-transfers',
    label: 'twoTransfers',
    invoices: [{ number: 'di-an-202609-02', dueDate: '2026-09-25', totalVnd: 3_500_000 }],
    payments: [
      { transfer: 1, amountVnd: 2_000_000 },
      { transfer: 2, amountVnd: 1_500_000 },
    ],
    expected: [
      { allocatedVnd: 2_000_000, outstandingVnd: 1_500_000, status: 'partial' },
      credit(0),
      { allocatedVnd: 1_500_000, outstandingVnd: 0, status: 'paid' },
      credit(0),
    ],
  },
  {
    id: 'overpay',
    label: 'overpay',
    invoices: [{ number: 'di-an-202609-04', dueDate: '2026-09-25', totalVnd: 3_500_000 }],
    payments: [{ transfer: 1, amountVnd: 4_000_000 }],
    expected: [{ allocatedVnd: 3_500_000, outstandingVnd: 0, status: 'paid' }, credit(500_000)],
  },
  {
    id: 'override',
    label: 'override',
    invoices: [AUG_6, SEP_6],
    payments: [
      { transfer: 1, amountVnd: 3_500_000, override: [[SEP_6.number, 3_500_000]] },
      {
        transfer: 2,
        amountVnd: 3_500_000,
        override: [
          [AUG_6.number, 3_500_000],
          [SEP_6.number, 1_000],
        ],
      },
    ],
    expected: [
      { allocatedVnd: 0, outstandingVnd: 3_500_000, status: 'unpaid' },
      { allocatedVnd: 3_500_000, outstandingVnd: 0, status: 'paid' },
      credit(0),
      { allocatedVnd: null, outstandingVnd: null, status: { refused: 'override_exceeds_payment' } },
    ],
  },
  {
    id: 'overdue',
    label: 'overdue',
    invoices: [{ number: 'di-an-202609-05', dueDate: '2026-09-25', totalVnd: 3_500_000 }],
    payments: [],
    expected: [{ allocatedVnd: 0, outstandingVnd: 3_500_000, status: 'unpaid' }],
  },
];

const DEPOSIT_EXAMPLES: readonly DepositExample[] = [
  {
    id: 'phong-7',
    label: 'phong7',
    entries: [
      ['2025-09-15', 'received', 3_500_000],
      ['2026-09-20', 'refunded', 4_000_000],
    ],
    expected: [3_500_000, { refused: 'exceeds_held', heldVnd: 3_500_000 }],
  },
  {
    id: 'bien-hoa',
    label: 'bienHoa',
    entries: [
      ['2024-07-30', 'received', 90_000_000],
      ['2026-08-05', 'refunded', 90_000_000],
    ],
    expected: [90_000_000, 0],
  },
];

type AllocationRow = { key: string; example: string; payment: string; subject: string; actual: Outcome; expected: Outcome | undefined };

function runAllocation(example: AllocationExample): { payment: number | null; subject: string | null; actual: Outcome }[] {
  const allocated = new Map(example.invoices.map((invoice) => [invoice.number, 0]));
  const standing = (invoice: Invoice, allocatedNow: number): Outcome => {
    const total = allocated.get(invoice.number) ?? 0;
    return {
      allocatedVnd: allocatedNow,
      outstandingVnd: Math.max(0, invoice.totalVnd - total),
      status: derivePaymentStatus(vnd(invoice.totalVnd), vnd(total)),
    };
  };
  if (example.payments.length === 0) {
    return example.invoices.map((invoice) => ({ payment: null, subject: invoice.number, actual: standing(invoice, 0) }));
  }
  return example.payments.flatMap((payment) => {
    const open: OpenInvoice[] = example.invoices.map((invoice) => ({
      id: invoice.number,
      dueDate: isoDate(invoice.dueDate),
      periodStart: isoDate(invoice.dueDate),
      outstandingVnd: vnd(Math.max(0, invoice.totalVnd - (allocated.get(invoice.number) ?? 0))),
    }));
    const override = payment.override?.map(([invoiceId, amount]): Allocation => ({ invoiceId, amountVnd: vnd(amount) }));
    const result = allocatePayment(vnd(payment.amountVnd), open, override);
    if (!result.ok) {
      return [{ payment: payment.transfer, subject: null, actual: { allocatedVnd: null, outstandingVnd: null, status: { refused: result.reason } } }];
    }
    const now = new Map(result.value.allocations.map((a) => [a.invoiceId, a.amountVnd]));
    for (const [number, amount] of now) allocated.set(number, (allocated.get(number) ?? 0) + amount);
    return [
      ...[...example.invoices]
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
        .map((invoice) => ({ payment: payment.transfer, subject: invoice.number, actual: standing(invoice, now.get(invoice.number) ?? 0) })),
      { payment: payment.transfer, subject: null, actual: credit(result.value.creditVnd) },
    ];
  });
}

export async function AllocationSection() {
  const [t, locale] = await Promise.all([getTranslations('devAllocation'), getLocale() as Promise<Locale>]);
  const money = (amount: number | null) => (amount === null ? '' : formatVnd(vnd(amount), locale));
  const status = (value: Outcome['status']) =>
    typeof value === 'string'
      ? value
      : value.heldVnd === undefined
        ? t('refused', { reason: value.refused })
        : t('refusedHeld', { reason: value.refused, held: money(value.heldVnd) });
  const outcome = (o: Outcome | undefined) =>
    o === undefined ? '' : [money(o.allocatedVnd), money(o.outstandingVnd), status(o.status)].filter(Boolean).join(' · ');
  const held = (value: number | Refused | undefined) =>
    value === undefined ? '' : typeof value === 'number' ? money(value) : status(value);

  const allocationRows: AllocationRow[] = ALLOCATION_EXAMPLES.flatMap((example) => {
    const totals = new Map(example.payments.map((p) => [p.transfer, p.amountVnd]));
    return runAllocation(example).map((row, i) => ({
      key: `${example.id}-${i}`,
      example: t(example.label),
      payment: row.payment === null ? t('noPayment') : t('transfer', { n: row.payment, amount: money(totals.get(row.payment) ?? 0) }),
      subject: row.subject ?? (row.actual.status === '' ? t('credit') : ''),
      actual: row.actual,
      expected: example.expected[i],
    }));
  });

  const depositRows = DEPOSIT_EXAMPLES.flatMap((example) => {
    const entries: DepositEntry[] = example.entries.map(([onDate, kind, amount], i) => ({
      id: `${example.id}-${i}`,
      kind,
      amountVnd: vnd(amount),
      onDate: isoDate(onDate),
    }));
    return entries.map((entry, i) => {
      const ledger = deriveDepositLedger(entries.slice(0, i + 1));
      const actual: number | Refused = ledger.ok
        ? ledger.value.heldVnd
        : { refused: ledger.reason, ...(ledger.reason === 'exceeds_held' && { heldVnd: ledger.heldVnd }) };
      return { key: entry.id, example: t(example.label), entry, actual, expected: example.expected[i] };
    });
  });

  const result = (matches: boolean, expected: string) => (matches ? t('match') : t('mismatchExpected', { expected }));
  const allocationColumns = [t('example'), t('payment'), t('invoice'), t('allocated'), t('outstanding'), t('status'), t('result')];
  const depositColumns = [t('ledger'), t('date'), t('kind'), t('amount'), t('held'), t('result')];

  return (
    <section aria-labelledby="allocation-heading" data-section="allocation" className="flex flex-col gap-4">
      <h2 id="allocation-heading" className="text-lead font-semibold">
        {t('title')}
      </h2>
      <p className="text-small text-ink-muted">{t('intro')}</p>

      <h3 className="font-semibold">{t('payments')}</h3>
      <DevTable
        columns={allocationColumns}
        rows={allocationRows.map((row) => {
          const matches = outcome(row.actual) === outcome(row.expected);
          return {
            key: row.key,
            attributes: { 'data-example': row.key.replace(/-\d+$/, ''), 'data-match': matches ? 'match' : 'mismatch' },
            cells: [
              ['example', row.example],
              ['payment', row.payment],
              ['invoice', row.subject],
              ['allocated', money(row.actual.allocatedVnd)],
              ['outstanding', money(row.actual.outstandingVnd)],
              ['status', status(row.actual.status)],
              ['result', result(matches, outcome(row.expected))],
            ],
          };
        })}
      />

      <h3 className="font-semibold">{t('deposits')}</h3>
      <DevTable
        columns={depositColumns}
        rows={depositRows.map((row) => {
          const matches = held(row.actual) === held(row.expected);
          return {
            key: row.key,
            attributes: { 'data-example': row.key.replace(/-\d+$/, ''), 'data-match': matches ? 'match' : 'mismatch' },
            cells: [
              ['ledger', row.example],
              ['date', formatDate(row.entry.onDate, locale)],
              ['kind', t(row.entry.kind)],
              ['amount', money(row.entry.amountVnd)],
              ['held', held(row.actual)],
              ['result', result(matches, held(row.expected))],
            ],
          };
        })}
      />
    </section>
  );
}

type DevRow = { key: string; attributes: Record<`data-${string}`, string>; cells: readonly (readonly [string, string])[] };

function DevTable({ columns, rows }: { columns: readonly string[]; rows: readonly DevRow[] }) {
  return (
    <table className="w-full text-left text-small max-sm:block">
      <thead className="max-sm:sr-only">
        <tr className="border-b">
          {columns.map((column) => (
            <th key={column} scope="col" className="py-1 pr-4">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="tabular-nums max-sm:block">
        {rows.map((row) => (
          <tr key={row.key} {...row.attributes} className="border-b align-top max-sm:grid max-sm:grid-cols-[auto_1fr] max-sm:gap-x-3 max-sm:py-2">
            {row.cells.map(([cell, value], i) => (
              <td key={cell} className={`py-1 pr-4 wrap-anywhere ${value === '' ? 'max-sm:hidden' : 'max-sm:contents'}`}>
                <span aria-hidden="true" className="font-sans font-normal text-meta sm:hidden">
                  {columns[i]}
                </span>
                <span data-cell={cell}>{value}</span>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
