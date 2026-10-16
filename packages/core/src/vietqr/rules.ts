import { vnd } from '../money/vnd';

export const NAPAS_AID = 'A000000727';

export const SERVICES = ['QRIBFTTA', 'QRIBFTTC'] as const;
export type Service = (typeof SERVICES)[number];

export const INITIATIONS = { static: '11', dynamic: '12' } as const;
export type Initiation = keyof typeof INITIATIONS;

// NAPAS QR Switching v1.5.2 (DOMAIN-VN §10). The cap is an [app rule] from NAPAS 247's
// "dưới 500 triệu VND/giao dịch", pending Ryan's confirmation (docs/plan/STATUS.md).
export const VIETQR_RULES = {
  payloadFormat: '01',
  currency: '704',
  country: 'VN',
  binDigits: 6,
  accountMaxChars: 19,
  amountMaxChars: 13,
  purposeMaxChars: 25,
  billNumberMaxChars: 25,
  additionalDataMaxChars: 99,
  singleTransferCapVnd: vnd(500_000_000),
} as const;

export const PRINTABLE_ASCII = /^[\x20-\x7E]+$/;

// [app rule] bank_accounts.account_name is the name as the bank prints it: printable ASCII with no
// lowercase letter (SPEC §5 bank_accounts).
export const ASCII_UPPERCASE = /^[\x20-\x60\x7B-\x7E]+$/;

export const BIN = /^\d{6}$/;
