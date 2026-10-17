import type { Vnd } from '../money/vnd';
import { encodeVietQr, requirePositiveVnd } from './encode';
import { ASCII_UPPERCASE, VIETQR_RULES } from './rules';

export const INVOICE_MEMO_PREFIX = 'ESTA';

const MEMO_CODE = /^[A-Z0-9]{8}$/;

// The shape P3-11's bank_accounts row satisfies (SPEC §5): bank_bin, account_no, account_name.
export type ReceivingAccount = {
  bin: string;
  accountNo: string;
  accountName: string;
};

export type InvoiceQrInput = {
  account: ReceivingAccount;
  outstandingVnd: Vnd;
  memoCode: string;
};

export type InvoiceQr =
  | { payload: string; amountInQr: true }
  | { payload: string; amountInQr: false; splitNote: { capVnd: Vnd } };

export function invoiceMemo(memoCode: string): string {
  if (!MEMO_CODE.test(memoCode)) throw new RangeError('memoCode must be 8 uppercase ASCII letters or digits');
  return `${INVOICE_MEMO_PREFIX} ${memoCode}`;
}

// At or above the NAPAS 247 single-transfer cap the QR carries no amount, so the payer's app asks for
// one and the invoice shows the full amount with a note to split the transfer.
export function buildInvoiceQr({ account, outstandingVnd, memoCode }: InvoiceQrInput): InvoiceQr {
  if (!ASCII_UPPERCASE.test(account.accountName)) {
    throw new RangeError('accountName must be printable ASCII with no lowercase letter');
  }
  requirePositiveVnd('outstandingVnd', outstandingVnd);
  const purpose = invoiceMemo(memoCode);
  const capVnd = VIETQR_RULES.singleTransferCapVnd;
  const base = { bin: account.bin, accountNo: account.accountNo, purpose };
  if (outstandingVnd >= capVnd) {
    return { payload: encodeVietQr(base), amountInQr: false, splitNote: { capVnd } };
  }
  return { payload: encodeVietQr({ ...base, amountVnd: outstandingVnd }), amountInQr: true };
}
