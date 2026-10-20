import type { IsoDate } from '../date/iso-date';
import { formatDate, formatVnd, vndInWords } from '../format';
import type { Vnd } from '../money/vnd';

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
  readonly labels: Labels;
};

/** A receipt as the PDF and the Zalo picture print it: every string in NFC and every amount in Vietnamese. */
export type ReceiptModel<Labels extends Record<string, string>> = {
  readonly header: string;
  readonly number: string;
  readonly issuedOn: string;
  readonly tenant: string;
  readonly place: string;
  /** `01/10/2026 – 31/10/2026`. */
  readonly period: string;
  readonly lines: readonly { readonly label: string; readonly amount: string }[];
  readonly total: string;
  readonly totalWords: string;
  readonly received: string;
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
  return {
    header: nfc(input.header),
    number: nfc(input.number),
    issuedOn: formatDate(input.issuedOn, 'vi'),
    tenant: nfc(input.tenant),
    place: nfc(input.place),
    period: `${formatDate(input.periodStart, 'vi')} – ${formatDate(input.periodEnd, 'vi')}`,
    lines: input.lines.map((line) => ({ label: nfc(line.label), amount: money(line.amountVnd) })),
    total: money(input.totalVnd),
    totalWords: nfc(vndInWords(input.totalVnd, 'vi')),
    received: money(input.receivedVnd),
    outstanding: money(input.outstandingVnd),
    paid: !owed,
    qr: owed && input.qr !== null ? { ...input.qr, memo: nfc(input.qr.memo), bank: nfc(input.qr.bank), accountName: nfc(input.qr.accountName) } : null,
    labels: Object.fromEntries(Object.entries(input.labels).map(([key, value]) => [key, nfc(value)])) as Labels,
  };
}
