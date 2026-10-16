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

export function amountDigits(amountVnd: Vnd): string {
  if (amountVnd <= 0) throw new RangeError('amountVnd must be positive');
  const digits = String(amountVnd);
  if (digits.length > VIETQR_RULES.amountMaxChars) {
    throw new RangeError(`amountVnd exceeds ${VIETQR_RULES.amountMaxChars} digits`);
  }
  return digits;
}

// Emits tags 00, 01, 38 (00 GUID, 01.00 BIN, 01.01 account, 02 QRIBFTTA), 53, 54, 58, 62 and 63 in that
// order. The encoder is strict because its input is Esta's own typed data; the decoder is tolerant.
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
