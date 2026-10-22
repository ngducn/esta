import { derivePaymentStatus } from '../allocation/status';
import type { IsoDate } from '../date/iso-date';
import { formatDate, formatDateRange, formatVnd, vndInWords } from '../format';
import type { Vnd } from '../money/vnd';

/** `notice` is `Thông báo tiền thuê`, `receipt` is `Biên nhận tiền thuê`. */
export type ReceiptKind = 'notice' | 'receipt';

/**
 * LSE-6, Ryan decided 2026-10-20: a bill with nothing received yet prints as a notice, and as a receipt once any money
 * is in. A bill that owes nothing reads `paid` (`derivePaymentStatus`), so it is a receipt.
 */
export const receiptKind = (totalVnd: Vnd, receivedVnd: Vnd): ReceiptKind => (derivePaymentStatus(totalVnd, receivedVnd) === 'unpaid' ? 'notice' : 'receipt');

/** What Mẹ gets paid to, printed under the code while something is still owed. */
export type ReceiptQr = { readonly payload: string; readonly memo: string; readonly bank: string; readonly accountNo: string; readonly accountName: string };

export type ReceiptInput<Labels extends Record<string, string>> = {
  /** `household_settings.invoicing.receipt_header`, else the household's name. */
  readonly header: string;
  readonly number: string;
  readonly issuedOn: IsoDate;
  readonly tenant: string;
  readonly place: string;
  readonly periodStart: IsoDate;
  readonly periodEnd: IsoDate;
  readonly lines: readonly { readonly label: string; readonly amountVnd: Vnd }[];
  readonly totalVnd: Vnd;
  readonly receivedVnd: Vnd;
  readonly outstandingVnd: Vnd;
  readonly qr: ReceiptQr | null;
  readonly titles: Readonly<Record<ReceiptKind, string>>;
  readonly labels: Labels;
};

/** A receipt as the PDF and the Zalo picture print it: every string in NFC and every amount in Vietnamese. */
export type ReceiptModel<Labels extends Record<string, string>> = {
  readonly kind: ReceiptKind;
  readonly title: string;
  readonly header: string;
  readonly number: string;
  readonly issuedOn: string;
  readonly tenant: string;
  readonly place: string;
  /** `01/10/2026 – 31/10/2026`. */
  readonly period: string;
  readonly lines: readonly { readonly label: string; readonly amount: string }[];
  readonly total: string;
  /** Null for a total below zero, which a meter credit larger than the rent once made and which has no words. */
  readonly totalWords: string | null;
  /** Null on a notice, which has nothing received to print. */
  readonly received: string | null;
  readonly outstanding: string;
  readonly paid: boolean;
  readonly qr: ReceiptQr | null;
  readonly labels: Labels;
};

const nfc = (text: string) => text.normalize('NFC');

/**
 * LSE-6. A receipt always prints in Vietnamese, whatever the screen's language, because the tenant reads it. Text is
 * NFC so the embedded font subsets one glyph per letter and text extraction returns the name as Studio stores it.
 */
export function buildReceiptModel<Labels extends Record<string, string>>(input: ReceiptInput<Labels>): ReceiptModel<Labels> {
  const money = (amount: Vnd) => nfc(formatVnd(amount, 'vi'));
  const owed = input.outstandingVnd > 0;
  const kind = receiptKind(input.totalVnd, input.receivedVnd);
  return {
    kind,
    title: nfc(input.titles[kind]),
    header: nfc(input.header),
    number: nfc(input.number),
    issuedOn: formatDate(input.issuedOn, 'vi'),
    tenant: nfc(input.tenant),
    place: nfc(input.place),
    period: formatDateRange(input.periodStart, input.periodEnd, 'vi'),
    lines: input.lines.map((line) => ({ label: nfc(line.label), amount: money(line.amountVnd) })),
    total: money(input.totalVnd),
    totalWords: input.totalVnd < 0 ? null : nfc(vndInWords(input.totalVnd, 'vi')),
    received: kind === 'notice' ? null : money(input.receivedVnd),
    outstanding: money(input.outstandingVnd),
    paid: !owed,
    qr: owed && input.qr !== null ? { ...input.qr, memo: nfc(input.qr.memo), bank: nfc(input.qr.bank), accountName: nfc(input.qr.accountName) } : null,
    labels: Object.fromEntries(Object.entries(input.labels).map(([key, value]) => [key, nfc(value)])) as Labels,
  };
}
