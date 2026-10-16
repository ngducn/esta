import { describe, expect, it } from 'vitest';
import { vnd } from '../money/vnd';
import { crc16CcittFalse, crcHex } from './crc';
import { decodeVietQr, describeDecodeFault } from './decode';
import { encodeVietQr, type VietQr, type VietQrInput } from './encode';
import { buildInvoiceQr, invoiceMemo } from './invoiceQr';
import { VIETQR_RULES } from './rules';
import { parseTlv, tlv } from './tlv';
import { DECODE_ONLY_VECTORS, ENCODE_VECTORS, ESTA_INVOICE, MALFORMED_VECTORS, NAPAS_6_3_1_WELL_FORMED } from './vectors';

function inputOf({ bin, accountNo, amountVnd, purpose, billNumber }: VietQr): VietQrInput {
  return {
    bin,
    accountNo,
    ...(amountVnd !== undefined && { amountVnd }),
    ...(purpose !== undefined && { purpose }),
    ...(billNumber !== undefined && { billNumber }),
  };
}

const ACCOUNT = { bin: '970436', accountNo: '0123456789' };

function signed(body: string): string {
  return body + crcHex(body);
}

function rootTags(payload: string): Map<string, string> {
  const parsed = parseTlv(payload);
  if (!parsed.ok) throw new Error(describeDecodeFault({ ...parsed.fault, path: '' }));
  return new Map(parsed.value);
}

describe('crc16CcittFalse', () => {
  it('matches the CRC-16/CCITT-FALSE check value for 123456789', () => {
    expect(crc16CcittFalse('123456789')).toBe(0x29b1);
    expect(crcHex('123456789')).toBe('29B1');
  });

  it('hashes an empty text to the initial value and ASCII bytes one at a time', () => {
    expect(crc16CcittFalse('')).toBe(0xffff);
    expect(crc16CcittFalse('A')).toBe(0xb915);
  });

  it('hashes non-ASCII text over its UTF-8 bytes, as another encoder would have signed it', () => {
    expect(crcHex('đ')).toBe('5407');
    expect(crcHex('Tiền nhà')).toBe('C0C7');
    expect(crcHex('𝄞')).toBe('94CE');
  });

  it('zero-pads a CRC below 0x1000 to four characters', () => {
    expect(crcHex('6')).toMatch(/^[0-9A-F]{4}$/);
    const text = [...Array(100_000).keys()].map(String).find((candidate) => crc16CcittFalse(candidate) < 0x100);
    expect(text).toBeDefined();
    expect(crcHex(text ?? '')).toMatch(/^00[0-9A-F]{2}$/);
  });
});

describe('tlv', () => {
  it('writes tag, two-digit length and value, and refuses an empty or 100-character value', () => {
    expect(tlv('00', '01')).toBe('000201');
    expect(tlv('62', 'X'.repeat(99))).toHaveLength(103);
    expect(() => tlv('62', '')).toThrow(RangeError);
    expect(() => tlv('62', 'X'.repeat(100))).toThrow(RangeError);
  });

  it('parses fields in order and names the fault for bad length, duplicate tag and malformed text', () => {
    expect(parseTlv('0002015802VN')).toEqual({
      ok: true,
      value: new Map([
        ['00', '01'],
        ['58', 'VN'],
      ]),
    });
    expect(parseTlv('5803VN')).toEqual({ ok: false, fault: { kind: 'length', tag: '58', declared: 3, remaining: 2 } });
    expect(parseTlv('5800')).toEqual({ ok: false, fault: { kind: 'length', tag: '58', declared: 0, remaining: 0 } });
    expect(parseTlv('5802VN5802VN')).toEqual({ ok: false, fault: { kind: 'duplicate', tag: '58' } });
    expect(parseTlv('5802VN8')).toEqual({ ok: false, fault: { kind: 'malformed', offset: 6 } });
    expect(parseTlv('5x02VN')).toEqual({ ok: false, fault: { kind: 'malformed', offset: 0 } });
  });
});

describe('published vectors', () => {
  it.each(ENCODE_VECTORS)('decodes and re-encodes $id byte for byte', ({ payload, expected }) => {
    expect(decodeVietQr(payload)).toEqual({ ok: true, value: expected });
    expect(encodeVietQr(inputOf(expected))).toBe(payload);
  });

  it.each(DECODE_ONLY_VECTORS)('decodes the card transfer $id', ({ payload, expected }) => {
    expect(decodeVietQr(payload)).toEqual({ ok: true, value: expected });
  });

  it.each(MALFORMED_VECTORS)('rejects $id with a typed fault', ({ payload, fault }) => {
    expect(decodeVietQr(payload)).toEqual({ ok: false, fault });
  });

  it('describes the two malformed samples by their CRC or length fault', () => {
    const [asPrinted, badCrc] = MALFORMED_VECTORS;
    expect(describeDecodeFault(asPrinted.fault)).toBe('tag 38.01: malformed TLV at offset 26');
    expect(describeDecodeFault(badCrc.fault)).toMatch(/^CRC mismatch: expected [0-9A-F]{4}, found AAB8$/);
  });

  it('encodes the NAPAS 6.3.1 static example once its account length is corrected', () => {
    expect(encodeVietQr({ bin: '970403', accountNo: '0011012345678' })).toBe(NAPAS_6_3_1_WELL_FORMED);
    expect(decodeVietQr(NAPAS_6_3_1_WELL_FORMED).ok).toBe(true);
  });

  it('reproduces the S4 invoice payload for 15,000,000 đồng with memo ESTA 7K2QX9MP', () => {
    expect(buildInvoiceQr(ESTA_INVOICE.input)).toEqual({ payload: ESTA_INVOICE.payload, amountInQr: true });
    expect(ESTA_INVOICE.payload).toHaveLength(124);
    expect(ESTA_INVOICE.payload).not.toContain(ESTA_INVOICE.input.account.accountName);
  });
});

describe('encodeVietQr', () => {
  it('emits the root tags in order 00, 01, 38, 53, 54, 58, 62, 63 and nothing else', () => {
    const parsed = parseTlv(encodeVietQr({ ...ACCOUNT, amountVnd: vnd(1), purpose: 'x', billNumber: 'b' }));
    expect(parsed.ok && [...parsed.value.keys()]).toEqual(['00', '01', '38', '53', '54', '58', '62', '63']);
    const merchant = parsed.ok ? parseTlv(parsed.value.get('38') ?? '') : parsed;
    expect(merchant.ok && [...merchant.value.entries()]).toEqual([
      ['00', 'A000000727'],
      ['01', '000697043601100123456789'],
      ['02', 'QRIBFTTA'],
    ]);
  });

  it('sets tag 01 to 12 with an amount and 11 without', () => {
    const dynamic = rootTags(encodeVietQr({ ...ACCOUNT, amountVnd: vnd(1_000) }));
    expect(dynamic.get('01')).toBe('12');
    expect(dynamic.get('54')).toBe('1000');
    const fixed = rootTags(encodeVietQr(ACCOUNT));
    expect(fixed.get('01')).toBe('11');
    expect(fixed.has('54')).toBe(false);
    expect(encodeVietQr(ACCOUNT)).toMatch(/5802VN6304[0-9A-F]{4}$/);
  });

  it('omits tag 62 without a purpose or bill number and writes 62 with 01 before 08', () => {
    expect(encodeVietQr(ACCOUNT)).not.toMatch(/5802VN62/);
    expect(encodeVietQr({ ...ACCOUNT, purpose: 'p', billNumber: 'B1' })).toContain('62110102B10801p6304');
  });

  it('accepts the largest amount the rules allow and refuses the next digit', () => {
    const largest = vnd(9_999_999_999_999);
    expect(encodeVietQr({ ...ACCOUNT, amountVnd: largest })).toContain('54139999999999999');
    expect(() => encodeVietQr({ ...ACCOUNT, amountVnd: vnd(10_000_000_000_000) })).toThrow(/13 digits/);
  });

  it.each([
    ['bin with 5 digits', { ...ACCOUNT, bin: '97043' }, /bin/],
    ['bin with a letter', { ...ACCOUNT, bin: '97043A' }, /bin/],
    ['account of 20 characters', { ...ACCOUNT, accountNo: '0'.repeat(20) }, /accountNo/],
    ['empty account', { ...ACCOUNT, accountNo: '' }, /accountNo/],
    ['non-ASCII account', { ...ACCOUNT, accountNo: 'tàikhoản' }, /accountNo/],
    ['zero amount', { ...ACCOUNT, amountVnd: vnd(0) }, /amountVnd/],
    ['negative amount', { ...ACCOUNT, amountVnd: vnd(-1) }, /amountVnd/],
    ['purpose of 26 characters', { ...ACCOUNT, purpose: 'X'.repeat(26) }, /purpose must be 1\.\.25/],
    ['empty purpose', { ...ACCOUNT, purpose: '' }, /purpose/],
    ['non-ASCII purpose', { ...ACCOUNT, purpose: 'Tiền nhà' }, /purpose/],
    ['bill number of 26 characters', { ...ACCOUNT, billNumber: 'B'.repeat(26) }, /billNumber/],
  ] as const)('refuses %s', (_name, input, message) => {
    expect(() => encodeVietQr(input)).toThrow(message);
  });

  it('accepts a purpose of exactly 25 characters', () => {
    expect(decodeVietQr(encodeVietQr({ ...ACCOUNT, purpose: 'Y'.repeat(25) }))).toMatchObject({
      ok: true,
      value: { purpose: 'Y'.repeat(25) },
    });
  });
});

describe('decodeVietQr', () => {
  const napas = ENCODE_VECTORS[0].payload;

  it('reports a CRC mismatch with the expected and found values when one character changes', () => {
    expect(decodeVietQr(napas.replace('180000', '190000'))).toEqual({
      ok: false,
      fault: { kind: 'crc_mismatch', expected: 'A1D2', found: '2E2E' },
    });
  });

  it('refuses a payload with no CRC field, a short CRC or a non-hex CRC', () => {
    expect(decodeVietQr(napas.slice(0, -8))).toEqual({ ok: false, fault: { kind: 'missing_crc' } });
    expect(decodeVietQr(napas.slice(0, -1))).toEqual({ ok: false, fault: { kind: 'missing_crc' } });
    expect(decodeVietQr(`${napas.slice(0, -4)}2E2G`)).toEqual({ ok: false, fault: { kind: 'missing_crc' } });
    expect(decodeVietQr('')).toEqual({ ok: false, fault: { kind: 'missing_crc' } });
  });

  it('accepts lowercase CRC hex', () => {
    expect(decodeVietQr(napas.slice(0, -4) + napas.slice(-4).toLowerCase()).ok).toBe(true);
  });

  it('accepts root tags in any order between 00 and 63', () => {
    const merchant = '38530010A0000007270123000697041601092576788590208QRIBFTTA';
    const payload = signed(`000201${'5802VN'}${'010211'}${'5303704'}${merchant}6304`);
    expect(decodeVietQr(payload)).toMatchObject({ ok: true, value: { accountNo: '257678859', initiation: 'static' } });
  });

  it('accepts tag 01 as 11 with an amount, as api.vietqr.vn emits it', () => {
    const payload = signed(napas.slice(0, -4).replace('010212', '010211'));
    expect(decodeVietQr(payload)).toMatchObject({ ok: true, value: { initiation: 'static', amountVnd: 180_000 } });
  });

  it('accepts an amount with a trailing dot and a purpose over 25 characters', () => {
    const merchant = tlv('38', `0010A000000727${tlv('01', `0006970436${tlv('01', '0123456789')}`)}0208QRIBFTTA`);
    const payload = signed(`000201010212${merchant}5303704${tlv('54', '50000.')}5802VN${tlv('62', tlv('08', 'Z'.repeat(31)))}6304`);
    expect(decodeVietQr(payload)).toMatchObject({ ok: true, value: { amountVnd: 50_000, purpose: 'Z'.repeat(31) } });
  });

  function merchant(bin = '970403', accountNo = '0011012345678', guid = 'A000000727', service = 'QRIBFTTA'): string {
    return tlv('38', tlv('00', guid) + tlv('01', tlv('00', bin) + tlv('01', accountNo)) + tlv('02', service));
  }

  it.each([
    ['tag 00 not first', ['010212', '000201', merchant(), '5303704', '5802VN'], { kind: 'field', tag: '00', expected: 'first, with value 01' }],
    ['tag 00 not 01', ['000202', '010212', merchant(), '5303704', '5802VN'], { kind: 'field', tag: '00', expected: 'first, with value 01' }],
    ['tag 63 swallowed by the field before it', ['000201', '5810VN'], { kind: 'field', tag: '63', expected: 'last' }],
    ['tag 01 out of range', ['000201', '010213', merchant(), '5303704', '5802VN'], { kind: 'field', tag: '01', expected: '11 or 12' }],
    ['tag 01 missing', ['000201', merchant(), '5303704', '5802VN'], { kind: 'field', tag: '01', expected: '11 or 12' }],
    ['currency not 704', ['000201', '010212', merchant(), '5303840', '5802VN'], { kind: 'field', tag: '53', expected: '704' }],
    ['country not VN', ['000201', '010212', merchant(), '5303704', '5802US'], { kind: 'field', tag: '58', expected: 'VN' }],
    ['tag 38 missing', ['000201', '010212', '5303704', '5802VN'], { kind: 'field', tag: '38', expected: 'present' }],
    ['wrong GUID', ['000201', '010212', merchant('970403', '1', 'A000000728'), '5303704', '5802VN'], { kind: 'field', tag: '38.00', expected: 'A000000727' }],
    ['unknown service', ['000201', '010212', merchant('970403', '1', 'A000000727', 'QRPUSHXX'), '5303704', '5802VN'], { kind: 'field', tag: '38.02', expected: 'QRIBFTTA or QRIBFTTC' }],
    ['BIN of 5 digits', ['000201', '010212', merchant('97040'), '5303704', '5802VN'], { kind: 'field', tag: '38.01.00', expected: '6 digits' }],
    ['account of 20 characters', ['000201', '010212', merchant('970403', '0'.repeat(20)), '5303704', '5802VN'], { kind: 'field', tag: '38.01.01', expected: '1..19 characters' }],
    ['tag 38.01 with a bad length', ['000201', '010212', '38570010A00000072701270006970403011200110123456780208QRIBFTTA', '5303704', '5802VN'], { kind: 'malformed', path: '38.01', offset: 26 }],
    ['zero amount', ['000201', '010212', merchant(), '5303704', '54010', '5802VN'], { kind: 'field', tag: '54', expected: 'a positive integer' }],
    ['amount with a letter', ['000201', '010212', merchant(), '5303704', '540618000X', '5802VN'], { kind: 'field', tag: '54', expected: 'integer digits for VND' }],
    ['amount with a thousands separator', ['000201', '010212', merchant(), '5303704', '540618.000', '5802VN'], { kind: 'field', tag: '54', expected: 'integer digits for VND' }],
    ['duplicate root tag', ['000201', '000201', '010212', merchant(), '5303704', '5802VN'], { kind: 'duplicate', path: '', tag: '00' }],
    ['tag 62 with a bad length', ['000201', '010212', merchant(), '5303704', '5802VN', '62060805ab'], { kind: 'length', path: '62', tag: '08', declared: 5, remaining: 2 }],
  ] as const)('refuses %s', (_name, parts, fault) => {
    expect(decodeVietQr(signed(`${parts.join('')}6304`))).toEqual({ ok: false, fault });
  });
});

describe('buildInvoiceQr', () => {
  const account = ESTA_INVOICE.input.account;

  it('writes the purpose as ESTA followed by the memo code', () => {
    expect(invoiceMemo('7K2QX9MP')).toBe('ESTA 7K2QX9MP');
    expect(invoiceMemo('7K2QX9MP')).toHaveLength(13);
    expect(decodeVietQr(buildInvoiceQr(ESTA_INVOICE.input).payload)).toMatchObject({
      ok: true,
      value: { purpose: 'ESTA 7K2QX9MP', amountVnd: 15_000_000, bin: '970436', accountNo: '0123456789' },
    });
  });

  it.each(['7k2qx9mp', '7K2QX9M', '7K2QX9MPX', 'ESTA 7K2Q', '', 'ĐK2QX9MP'])('refuses memo code %j', (memoCode) => {
    expect(() => invoiceMemo(memoCode)).toThrow(RangeError);
    expect(() => buildInvoiceQr({ ...ESTA_INVOICE.input, memoCode })).toThrow(RangeError);
  });

  it('keeps tag 54 below the cap', () => {
    const qr = buildInvoiceQr({ account, outstandingVnd: vnd(499_999_999), memoCode: '7K2QX9MP' });
    expect(qr).toEqual({ payload: expect.any(String), amountInQr: true });
    expect(rootTags(qr.payload).get('54')).toBe('499999999');
    expect(decodeVietQr(qr.payload)).toMatchObject({ ok: true, value: { initiation: 'dynamic', amountVnd: 499_999_999 } });
  });

  it.each([500_000_000, 600_000_000])('drops tag 54 at %i and returns the split note with the cap', (outstanding) => {
    const qr = buildInvoiceQr({ account, outstandingVnd: vnd(outstanding), memoCode: '7K2QX9MP' });
    expect(qr).toEqual({
      payload: expect.any(String),
      amountInQr: false,
      splitNote: { capVnd: VIETQR_RULES.singleTransferCapVnd },
    });
    expect(rootTags(qr.payload).has('54')).toBe(false);
    expect(rootTags(qr.payload).get('01')).toBe('11');
    expect(decodeVietQr(qr.payload)).toMatchObject({ ok: true, value: { initiation: 'static', purpose: 'ESTA 7K2QX9MP' } });
    expect(decodeVietQr(qr.payload)).not.toHaveProperty('value.amountVnd');
  });

  it('refuses a zero or negative outstanding amount', () => {
    expect(() => buildInvoiceQr({ account, outstandingVnd: vnd(0), memoCode: '7K2QX9MP' })).toThrow(/outstandingVnd/);
    expect(() => buildInvoiceQr({ account, outstandingVnd: vnd(-1), memoCode: '7K2QX9MP' })).toThrow(/outstandingVnd/);
  });

  it.each(['Nguyen Thi Demo', 'NGUYỄN THỊ DEMO', '', 'NGUYEN\tTHI'])('refuses the account name %j', (accountName) => {
    expect(() => buildInvoiceQr({ ...ESTA_INVOICE.input, account: { ...account, accountName } })).toThrow(/accountName/);
  });

  it('accepts an uppercase ASCII name with digits and punctuation and keeps it out of the payload', () => {
    const named = buildInvoiceQr({ ...ESTA_INVOICE.input, account: { ...account, accountName: 'CTY TNHH DEMO 2 - HCM.' } });
    expect(named.payload).toBe(ESTA_INVOICE.payload);
  });
});
