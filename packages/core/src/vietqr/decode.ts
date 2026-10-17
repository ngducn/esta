import { vnd } from '../money/vnd';
import { crcHex } from './crc';
import type { VietQr } from './encode';
import { BIN, INITIATIONS, NAPAS_AID, SERVICES, VIETQR_RULES, type Initiation, type Service } from './rules';
import { parseTlv, type Tlv, type TlvFault } from './tlv';

export type DecodeFault =
  | { kind: 'missing_crc' }
  | { kind: 'crc_mismatch'; expected: string; found: string }
  | (TlvFault & { path: string })
  | { kind: 'field'; tag: string; expected: string };

export type DecodeResult = { ok: true; value: VietQr } | { ok: false; fault: DecodeFault };

const CRC_FIELD = /^([\s\S]*6304)([0-9A-Fa-f]{4})$/;
const AMOUNT = /^\d+\.?$/;

const INITIATION_BY_CODE = new Map<string, Initiation>(
  (Object.keys(INITIATIONS) as Initiation[]).map((name) => [INITIATIONS[name], name]),
);

function isService(text: string | undefined): text is Service {
  return (SERVICES as readonly string[]).includes(text ?? '');
}

type Step = { ok: true; value: Tlv } | { ok: false; fault: DecodeFault };

function parseAt(path: string, text: string): Step {
  const parsed = parseTlv(text);
  return parsed.ok ? parsed : { ok: false, fault: { ...parsed.fault, path } };
}

function field(tag: string, expected: string): DecodeResult {
  return { ok: false, fault: { kind: 'field', tag, expected } };
}

// Accepts any root order between 00 and 63, either tag 01 value, lowercase CRC hex and a purpose over
// 25 characters, because payloads from other encoders carry all of these.
export function decodeVietQr(payload: string): DecodeResult {
  const crcMatch = CRC_FIELD.exec(payload);
  if (!crcMatch) return { ok: false, fault: { kind: 'missing_crc' } };
  const signed = crcMatch[1] ?? '';
  const found = (crcMatch[2] ?? '').toUpperCase();
  const expected = crcHex(signed);
  if (expected !== found) return { ok: false, fault: { kind: 'crc_mismatch', expected, found } };

  const root = parseAt('', payload);
  if (!root.ok) return root;
  const tags = [...root.value.keys()];
  if (tags[0] !== '00' || root.value.get('00') !== VIETQR_RULES.payloadFormat) return field('00', 'first, with value 01');
  if (tags.at(-1) !== '63') return field('63', 'last');
  if (root.value.get('63')?.length !== 4) return field('63', '4 characters');

  const initiation = INITIATION_BY_CODE.get(root.value.get('01') ?? '');
  if (initiation === undefined) return field('01', '11 or 12');
  if (root.value.get('53') !== VIETQR_RULES.currency) return field('53', VIETQR_RULES.currency);
  if (root.value.get('58') !== VIETQR_RULES.country) return field('58', VIETQR_RULES.country);

  const merchantText = root.value.get('38');
  if (merchantText === undefined) return field('38', 'present');
  const merchant = parseAt('38', merchantText);
  if (!merchant.ok) return merchant;
  if (merchant.value.get('00') !== NAPAS_AID) return field('38.00', NAPAS_AID);
  const service = merchant.value.get('02');
  if (!isService(service)) return field('38.02', SERVICES.join(' or '));
  const beneficiary = parseAt('38.01', merchant.value.get('01') ?? '');
  if (!beneficiary.ok) return beneficiary;
  const bin = beneficiary.value.get('00');
  const accountNo = beneficiary.value.get('01');
  if (bin === undefined || !BIN.test(bin)) return field('38.01.00', `${VIETQR_RULES.binDigits} digits`);
  if (accountNo === undefined || accountNo.length > VIETQR_RULES.accountMaxChars) {
    return field('38.01.01', `1..${VIETQR_RULES.accountMaxChars} characters`);
  }

  const value: VietQr = { initiation, bin, accountNo, service };

  const amountText = root.value.get('54');
  if (amountText !== undefined) {
    if (!AMOUNT.test(amountText)) return field('54', 'integer digits for VND');
    const amount = Number(amountText.replace('.', ''));
    if (!Number.isSafeInteger(amount) || amount <= 0) return field('54', 'a positive integer');
    value.amountVnd = vnd(amount);
  }

  const additionalText = root.value.get('62');
  if (additionalText !== undefined) {
    const additional = parseAt('62', additionalText);
    if (!additional.ok) return additional;
    const purpose = additional.value.get('08');
    const billNumber = additional.value.get('01');
    if (purpose !== undefined) value.purpose = purpose;
    if (billNumber !== undefined) value.billNumber = billNumber;
  }

  return { ok: true, value };
}

export function describeDecodeFault(fault: DecodeFault): string {
  switch (fault.kind) {
    case 'missing_crc':
      return 'payload does not end with a 6304 CRC field';
    case 'crc_mismatch':
      return `CRC mismatch: expected ${fault.expected}, found ${fault.found}`;
    case 'malformed':
      return `${fault.path === '' ? 'payload' : `tag ${fault.path}`}: malformed TLV at offset ${fault.offset}`;
    case 'length': {
      const tag = fault.path === '' ? fault.tag : `${fault.path}.${fault.tag}`;
      return `tag ${tag} declares length ${fault.declared} but ${fault.remaining} characters remain`;
    }
    case 'duplicate':
      return `duplicate tag ${fault.path === '' ? fault.tag : `${fault.path}.${fault.tag}`}`;
    case 'field':
      return `tag ${fault.tag} must be ${fault.expected}`;
  }
}
