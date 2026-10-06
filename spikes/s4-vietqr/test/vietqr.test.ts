import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crc16CcittFalse, decodeVietQr, encodeVietQr, type VietQr, type VietQrInput } from '../src/vietqr.ts';
import { findMemoCodes, memoText } from '../src/memo.ts';
import { NAPAS_6_3_1_WELL_FORMED, decodeOnly, malformed, vectors } from './vectors.ts';

function inputOf(v: VietQr): VietQrInput {
  const { bin, accountNo, amountVnd, purpose, billNumber } = v;
  return {
    bin,
    accountNo,
    ...(amountVnd !== undefined && { amountVnd }),
    ...(purpose !== undefined && { purpose }),
    ...(billNumber !== undefined && { billNumber }),
  };
}

test('CRC-16/CCITT-FALSE check value', () => {
  assert.equal(crc16CcittFalse('123456789'), 0x29b1);
});

for (const v of vectors) {
  test(`decodes ${v.id}`, () => {
    assert.deepEqual(decodeVietQr(v.payload), { ok: true, value: v.expected });
  });
  test(`encodes ${v.id} byte for byte`, () => {
    assert.equal(encodeVietQr(inputOf(v.expected)), v.payload);
  });
}

for (const v of decodeOnly) {
  test(`decodes ${v.id}`, () => {
    assert.deepEqual(decodeVietQr(v.payload), { ok: true, value: v.expected });
  });
}

for (const m of malformed) {
  test(`rejects ${m.id}`, () => {
    const result = decodeVietQr(m.payload);
    assert.match(result.ok ? 'accepted' : result.error, m.error);
  });
}

test('encodes the NAPAS 6.3.1 static example with its account length corrected', () => {
  assert.equal(encodeVietQr({ bin: '970403', accountNo: '0011012345678' }), NAPAS_6_3_1_WELL_FORMED);
});

test('rejects a payload with one character changed', () => {
  const good = vectors.find((v) => v.id === 'napas-6.3.3-dynamic-account')!.payload;
  const tampered = good.replace('180000', '190000');
  const result = decodeVietQr(tampered);
  assert.deepEqual(result.ok ? null : result.error.startsWith('CRC mismatch'), true);
});

test('accepts lowercase CRC hex', () => {
  const good = vectors[0]!.payload;
  assert.equal(decodeVietQr(good.slice(0, -4) + good.slice(-4).toLowerCase()).ok, true);
});

test('zero-pads a CRC below 0x1000', () => {
  let amountVnd = 1;
  let payload = encodeVietQr({ bin: '970436', accountNo: '0123456789', amountVnd });
  while (crc16CcittFalse(payload.slice(0, -4)) >= 0x1000) {
    amountVnd++;
    payload = encodeVietQr({ bin: '970436', accountNo: '0123456789', amountVnd });
  }
  assert.match(payload, /6304[0][0-9A-F]{3}$/);
  assert.deepEqual(decodeVietQr(payload), {
    ok: true,
    value: { initiation: 'dynamic', bin: '970436', accountNo: '0123456789', service: 'QRIBFTTA', currency: '704', country: 'VN', amountVnd },
  });
});

test('accepts root tags in any order between 00 and 63', () => {
  const body = '000201' + '5802VN' + '010211' + '5303704' + '38530010A0000007270123000697041601092576788590208QRIBFTTA' + '6304';
  const payload = body + crc16CcittFalse(body).toString(16).toUpperCase().padStart(4, '0');
  const result = decodeVietQr(payload);
  assert.equal(result.ok && result.value.accountNo, '257678859');
});

test('encoder rejects invalid input', () => {
  const ok = { bin: '970436', accountNo: '0123456789' };
  assert.throws(() => encodeVietQr({ ...ok, bin: '97043' }), /bin/);
  assert.throws(() => encodeVietQr({ ...ok, accountNo: '01234567890123456789' }), /accountNo/);
  assert.throws(() => encodeVietQr({ ...ok, amountVnd: 0 }), /amountVnd/);
  assert.throws(() => encodeVietQr({ ...ok, amountVnd: 1500.5 }), /amountVnd/);
  assert.throws(() => encodeVietQr({ ...ok, amountVnd: 10_000_000_000_000 }), /13 digits/);
  assert.throws(() => encodeVietQr({ ...ok, purpose: 'X'.repeat(26) }), /purpose/);
  assert.throws(() => encodeVietQr({ ...ok, purpose: 'Tiền nhà' }), /purpose/);
});

test('Esta memo fits tag 62.08 and survives the round trip', () => {
  const purpose = memoText('7K2QX9MP');
  assert.equal(purpose.length, 13);
  const payload = encodeVietQr({ bin: '970436', accountNo: '0123456789', amountVnd: 15_000_000, purpose });
  const result = decodeVietQr(payload);
  assert.equal(result.ok && result.value.purpose, 'ESTA 7K2QX9MP');
});

test('statement matching finds the memo code however the bank mangles it', () => {
  const codes = new Set(['7K2QX9MP', 'A1B2C3D4']);
  const cases: Array<[string, string[]]> = [
    ['MBVCB.1234567.ESTA7K2QX9MP.CT TU 0903123456 NGUYEN VAN DEMO', ['7K2QX9MP']],
    ['ESTA 7K2QX9MP', ['7K2QX9MP']],
    ['esta-7k2qx9mp', ['7K2QX9MP']],
    ['IBFT ESTA 7K2QX9MP CT TU VCB', ['7K2QX9MP']],
    ['FIESTA12345678 ESTA 7K2QX9MP', ['7K2QX9MP']],
    ['ESTA A1B2C3D4 ESTA 7K2QX9MP', ['A1B2C3D4', '7K2QX9MP']],
    ['ESTA 7K2QX9', []],
    ['ESTA 9Z9Z9Z9Z', []],
    ['CHUYEN TIEN NHA THANG 10', []],
  ];
  for (const [description, expected] of cases) {
    assert.deepEqual(findMemoCodes(description, codes), expected, description);
  }
});
