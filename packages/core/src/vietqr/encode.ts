import type { Vnd } from '../money/vnd';
import { crcHex } from './crc';
import { BIN, INITIATIONS, NAPAS_AID, PRINTABLE_ASCII, VIETQR_RULES, type Initiation, type Service } from './rules';
import { tlv } from './tlv';

export type VietQrInput = {
  bin: string;
  accountNo: string;
  amountVnd?: Vnd;
  purpose?: string;
  billNumber?: string;
};

export type VietQr = {
  initiation: Initiation;
  bin: string;
  accountNo: string;
  service: Service;
  amountVnd?: Vnd;
  purpose?: string;
  billNumber?: string;
};

function requireAns(field: string, value: string, max: number): void {
  if (value.length > max || !PRINTABLE_ASCII.test(value)) {
    throw new RangeError(`${field} must be 1..${max} printable ASCII characters`);
  }
}

// Checks the value as well as the brand, because a cast can carry 1.5, NaN or 1e21 and String() writes each into tag 54.
export function requirePositiveVnd(field: string, amount: Vnd): void {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new RangeError(`${field} must be a positive integer`);
}

function amountDigits(amountVnd: Vnd): string {
  requirePositiveVnd('amountVnd', amountVnd);
  const digits = String(amountVnd);
  if (digits.length > VIETQR_RULES.amountMaxChars) {
    throw new RangeError(`amountVnd exceeds ${VIETQR_RULES.amountMaxChars} digits`);
  }
  return digits;
}

// Strict, because its input is Esta's own typed data; the decoder is the tolerant side.
export function encodeVietQr(input: VietQrInput): string {
  if (!BIN.test(input.bin)) throw new RangeError('bin must be 6 digits');
  requireAns('accountNo', input.accountNo, VIETQR_RULES.accountMaxChars);
  const amount = input.amountVnd === undefined ? undefined : amountDigits(input.amountVnd);
  if (input.purpose !== undefined) requireAns('purpose', input.purpose, VIETQR_RULES.purposeMaxChars);
  if (input.billNumber !== undefined) requireAns('billNumber', input.billNumber, VIETQR_RULES.billNumberMaxChars);

  const beneficiary = tlv('00', input.bin) + tlv('01', input.accountNo);
  const merchantAccount = tlv('00', NAPAS_AID) + tlv('01', beneficiary) + tlv('02', 'QRIBFTTA');
  const additional =
    (input.billNumber === undefined ? '' : tlv('01', input.billNumber)) +
    (input.purpose === undefined ? '' : tlv('08', input.purpose));

  const body =
    tlv('00', VIETQR_RULES.payloadFormat) +
    tlv('01', INITIATIONS[amount === undefined ? 'static' : 'dynamic']) +
    tlv('38', merchantAccount) +
    tlv('53', VIETQR_RULES.currency) +
    (amount === undefined ? '' : tlv('54', amount)) +
    tlv('58', VIETQR_RULES.country) +
    (additional === '' ? '' : tlv('62', additional)) +
    '6304';
  return body + crcHex(body);
}
