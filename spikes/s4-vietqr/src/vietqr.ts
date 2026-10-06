export const NAPAS_AID = 'A000000727';

export type Service = 'QRIBFTTA' | 'QRIBFTTC';
export type Initiation = 'static' | 'dynamic';

export interface VietQrInput {
  bin: string;
  accountNo: string;
  amountVnd?: number;
  purpose?: string;
  billNumber?: string;
}

export interface VietQr {
  initiation: Initiation;
  bin: string;
  accountNo: string;
  service: Service;
  currency: '704';
  country: 'VN';
  amountVnd?: number;
  purpose?: string;
  billNumber?: string;
}

export type DecodeResult = { ok: true; value: VietQr } | { ok: false; error: string };

const INITIATION_CODE: Record<Initiation, string> = { static: '11', dynamic: '12' };
const INITIATION_BY_CODE: Record<string, Initiation> = { '11': 'static', '12': 'dynamic' };
const SERVICES: readonly Service[] = ['QRIBFTTA', 'QRIBFTTC'];

const PURPOSE_MAX = 25;
const BILL_NUMBER_MAX = 25;
const ACCOUNT_MAX = 19;
const AMOUNT_MAX_CHARS = 13;
const ANS = /^[\x20-\x7E]+$/;

export function crc16CcittFalse(input: string): number {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(input)) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

function crcHex(input: string): string {
  return crc16CcittFalse(input).toString(16).toUpperCase().padStart(4, '0');
}

function tlv(tag: string, value: string): string {
  if (value.length < 1 || value.length > 99) {
    throw new RangeError(`tag ${tag}: value length ${value.length} outside 1..99`);
  }
  return tag + String(value.length).padStart(2, '0') + value;
}

function requireAns(field: string, value: string, max: number): void {
  if (value.length > max || !ANS.test(value)) {
    throw new RangeError(`${field} must be 1..${max} printable ASCII characters`);
  }
}

export function encodeVietQr(input: VietQrInput): string {
  if (!/^\d{6}$/.test(input.bin)) throw new RangeError('bin must be 6 digits');
  requireAns('accountNo', input.accountNo, ACCOUNT_MAX);

  const hasAmount = input.amountVnd !== undefined;
  let amount = '';
  if (hasAmount) {
    const v = input.amountVnd as number;
    if (!Number.isSafeInteger(v) || v <= 0) throw new RangeError('amountVnd must be a positive integer');
    amount = String(v);
    if (amount.length > AMOUNT_MAX_CHARS) throw new RangeError('amountVnd exceeds 13 digits');
  }
  if (input.purpose !== undefined) requireAns('purpose', input.purpose, PURPOSE_MAX);
  if (input.billNumber !== undefined) requireAns('billNumber', input.billNumber, BILL_NUMBER_MAX);

  const beneficiary = tlv('00', input.bin) + tlv('01', input.accountNo);
  const merchantAccount = tlv('00', NAPAS_AID) + tlv('01', beneficiary) + tlv('02', 'QRIBFTTA');
  const additional =
    (input.billNumber !== undefined ? tlv('01', input.billNumber) : '') +
    (input.purpose !== undefined ? tlv('08', input.purpose) : '');

  const body =
    tlv('00', '01') +
    tlv('01', INITIATION_CODE[hasAmount ? 'dynamic' : 'static']) +
    tlv('38', merchantAccount) +
    tlv('53', '704') +
    (hasAmount ? tlv('54', amount) : '') +
    tlv('58', 'VN') +
    (additional ? tlv('62', additional) : '') +
    '6304';
  return body + crcHex(body);
}

type Fields = Map<string, string>;

function parseTlv(s: string): Fields | string {
  const fields: Fields = new Map();
  let i = 0;
  while (i < s.length) {
    const tag = s.slice(i, i + 2);
    const lenText = s.slice(i + 2, i + 4);
    if (!/^\d{2}$/.test(tag) || !/^\d{2}$/.test(lenText)) return `malformed TLV at offset ${i}`;
    const len = Number(lenText);
    const value = s.slice(i + 4, i + 4 + len);
    if (len === 0 || value.length !== len) return `tag ${tag} declares length ${len} but ${value.length} characters remain`;
    if (fields.has(tag)) return `duplicate tag ${tag}`;
    fields.set(tag, value);
    i += 4 + len;
  }
  return fields;
}

function fail(error: string): DecodeResult {
  return { ok: false, error };
}

export function decodeVietQr(payload: string): DecodeResult {
  const crcMatch = /^(.*6304)([0-9A-Fa-f]{4})$/s.exec(payload);
  if (!crcMatch) return fail('payload does not end with a 6304 CRC field');
  const [, signed, crc] = crcMatch as unknown as [string, string, string];
  if (crcHex(signed) !== crc.toUpperCase()) return fail(`CRC mismatch: expected ${crcHex(signed)}, found ${crc}`);

  const root = parseTlv(payload);
  if (typeof root === 'string') return fail(root);
  const tags = [...root.keys()];
  if (tags[0] !== '00' || root.get('00') !== '01') return fail('tag 00 must be first with value 01');
  if (tags[tags.length - 1] !== '63') return fail('tag 63 must be last');

  const initiation = INITIATION_BY_CODE[root.get('01') ?? ''];
  if (!initiation) return fail('tag 01 must be 11 or 12');
  if (root.get('53') !== '704') return fail('tag 53 must be 704');
  if (root.get('58') !== 'VN') return fail('tag 58 must be VN');

  const merchantRaw = root.get('38');
  if (merchantRaw === undefined) return fail('tag 38 missing');
  const merchant = parseTlv(merchantRaw);
  if (typeof merchant === 'string') return fail(`tag 38: ${merchant}`);
  if (merchant.get('00') !== NAPAS_AID) return fail(`tag 38.00 must be ${NAPAS_AID}`);
  const service = merchant.get('02');
  if (!SERVICES.includes(service as Service)) return fail(`tag 38.02 ${service ?? 'missing'} is not an IBFT service`);
  const beneficiary = parseTlv(merchant.get('01') ?? '');
  if (typeof beneficiary === 'string') return fail(`tag 38.01: ${beneficiary}`);
  const bin = beneficiary.get('00');
  const accountNo = beneficiary.get('01');
  if (!bin || !/^\d{6}$/.test(bin)) return fail('tag 38.01.00 must be a 6-digit BIN');
  if (!accountNo || accountNo.length > ACCOUNT_MAX) return fail('tag 38.01.01 must be 1..19 characters');

  const value: VietQr = { initiation, bin, accountNo, service: service as Service, currency: '704', country: 'VN' };

  const amount = root.get('54');
  if (amount !== undefined) {
    if (!/^\d+\.?$/.test(amount)) return fail('tag 54 must be integer digits for VND');
    const n = Number(amount.replace('.', ''));
    if (!Number.isSafeInteger(n) || n <= 0) return fail('tag 54 must be a positive integer');
    value.amountVnd = n;
  }

  const additionalRaw = root.get('62');
  if (additionalRaw !== undefined) {
    const additional = parseTlv(additionalRaw);
    if (typeof additional === 'string') return fail(`tag 62: ${additional}`);
    const purpose = additional.get('08');
    const billNumber = additional.get('01');
    if (purpose !== undefined) value.purpose = purpose;
    if (billNumber !== undefined) value.billNumber = billNumber;
  }

  return { ok: true, value };
}
