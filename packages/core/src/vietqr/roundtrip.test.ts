import fc from 'fast-check';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import QRCode from 'qrcode';
import { QRPay } from 'vietnam-qr-pay';
import { describe, expect, it } from 'vitest';
import { vnd } from '../money/vnd';
import { decodeVietQr } from './decode';
import { encodeVietQr, type VietQrInput } from './encode';
import { buildInvoiceQr, invoiceMemo } from './invoiceQr';
import { VIETQR_RULES } from './rules';
import { parseTlv } from './tlv';
import { ENCODE_VECTORS, ESTA_INVOICE } from './vectors';

const params = { seed: 20261007, numRuns: 500 };

const printableAscii = fc.integer({ min: 0x20, max: 0x7e }).map((code) => String.fromCharCode(code));
const ans = (maxLength: number) => fc.string({ unit: printableAscii, minLength: 1, maxLength });
const bin = fc.integer({ min: 0, max: 999_999 }).map((n) => String(n).padStart(6, '0'));
const amount = fc.integer({ min: 1, max: 9_999_999_999_999 }).map(vnd);
const memoCode = fc.string({ unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'), minLength: 8, maxLength: 8 });
const accountName = ans(60).map((text) => text.toUpperCase());

const input: fc.Arbitrary<VietQrInput> = fc
  .record(
    {
      bin,
      accountNo: ans(VIETQR_RULES.accountMaxChars),
      amountVnd: amount,
      purpose: ans(VIETQR_RULES.purposeMaxChars),
      billNumber: ans(VIETQR_RULES.billNumberMaxChars),
    },
    { requiredKeys: ['bin', 'accountNo'] },
  )
  .map(({ bin, accountNo, amountVnd, purpose, billNumber }) => ({
    bin,
    accountNo,
    ...(amountVnd !== undefined && { amountVnd }),
    ...(purpose !== undefined && { purpose }),
    ...(billNumber !== undefined && { billNumber }),
  }));

function hasTag(payload: string, tag: string): boolean {
  const parsed = parseTlv(payload);
  return parsed.ok && parsed.value.has(tag);
}

describe('encode and decode round trips (LSE-5)', () => {
  it('decodes every field the encoder wrote, with tag 01 following the amount', () => {
    fc.assert(
      fc.property(input, (value) => {
        expect(decodeVietQr(encodeVietQr(value))).toEqual({
          ok: true,
          value: { ...value, initiation: value.amountVnd === undefined ? 'static' : 'dynamic', service: 'QRIBFTTA' },
        });
      }),
      params,
    );
  });

  it('detects any one character changed before the CRC field as a CRC mismatch', () => {
    fc.assert(
      fc.property(input, fc.nat(), fc.integer({ min: 0x30, max: 0x39 }), (value, seed, code) => {
        const payload = encodeVietQr(value);
        const index = seed % (payload.length - 8);
        const current = payload.charAt(index);
        const replacement = String.fromCharCode(code) === current ? '!' : String.fromCharCode(code);
        const tampered = payload.slice(0, index) + replacement + payload.slice(index + 1);
        expect(decodeVietQr(tampered)).toMatchObject({ ok: false, fault: { kind: 'crc_mismatch' } });
      }),
      params,
    );
  });
});

describe('buildInvoiceQr properties', () => {
  it('carries the amount and memo below the cap and the memo alone at or above it', () => {
    fc.assert(
      fc.property(bin, ans(VIETQR_RULES.accountMaxChars), accountName, amount, memoCode, (bin, accountNo, name, outstandingVnd, code) => {
        const qr = buildInvoiceQr({ account: { bin, accountNo, accountName: name }, outstandingVnd, memoCode: code });
        const decoded = decodeVietQr(qr.payload);
        expect(decoded).toMatchObject({ ok: true, value: { bin, accountNo, purpose: `ESTA ${code}` } });
        expect(invoiceMemo(code)).toHaveLength(13);
        if (outstandingVnd >= VIETQR_RULES.singleTransferCapVnd) {
          expect(qr).toMatchObject({ amountInQr: false, splitNote: { capVnd: 500_000_000 } });
          expect(hasTag(qr.payload, '54')).toBe(false);
        } else {
          expect(qr).toMatchObject({ amountInQr: true });
          expect(decoded).toMatchObject({ ok: true, value: { amountVnd: outstandingVnd } });
        }
      }),
      params,
    );
  });

  it('produces the same payload whatever the account name, and refuses a name with a lowercase letter', () => {
    fc.assert(
      fc.property(accountName, accountName, fc.integer({ min: 0x61, max: 0x7a }), (first, second, lower) => {
        const named = (accountName: string) =>
          buildInvoiceQr({ ...ESTA_INVOICE.input, account: { ...ESTA_INVOICE.input.account, accountName } });
        expect(named(first)).toEqual(named(second));
        expect(() => named(first + String.fromCharCode(lower))).toThrow(/accountName/);
      }),
      params,
    );
  });
});

describe('PNG round trip', () => {
  async function scan(payload: string): Promise<string | undefined> {
    const png = PNG.sync.read(await QRCode.toBuffer(payload, { type: 'png', errorCorrectionLevel: 'M', margin: 4, scale: 8 }));
    return jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data;
  }

  it('reads the invoice QR back from its PNG pixels as the same payload', async () => {
    const { payload } = buildInvoiceQr(ESTA_INVOICE.input);
    expect(await scan(payload)).toBe(payload);
    expect(QRCode.create(payload, { errorCorrectionLevel: 'M' }).version).toBeLessThanOrEqual(6);
  });

  it.each(ENCODE_VECTORS)('reads $id back from its PNG pixels', async ({ payload }) => {
    expect(await scan(payload)).toBe(payload);
  });
});

describe('vietnam-qr-pay as an independent implementation', () => {
  const { account, outstandingVnd, memoCode: code } = ESTA_INVOICE.input;

  it('parses the invoice payload to the same fields', () => {
    const parsed = new QRPay(ESTA_INVOICE.payload);
    expect({
      isValid: parsed.isValid,
      initMethod: parsed.initMethod,
      bankBin: parsed.consumer.bankBin,
      bankNumber: parsed.consumer.bankNumber,
      amount: parsed.amount,
      purpose: parsed.additionalData.purpose,
      currency: parsed.currency,
      nation: parsed.nation,
    }).toEqual({
      isValid: true,
      initMethod: '12',
      bankBin: account.bin,
      bankNumber: account.accountNo,
      amount: String(outstandingVnd),
      purpose: ESTA_INVOICE.purpose,
      currency: '704',
      nation: 'VN',
    });
  });

  it('builds the same bytes for the invoice', () => {
    const built = QRPay.initVietQR({
      bankBin: account.bin,
      bankNumber: account.accountNo,
      amount: String(outstandingVnd),
      purpose: invoiceMemo(code),
    }).build();
    expect(built).toBe(ESTA_INVOICE.payload);
  });
});
