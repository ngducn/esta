import { describe, expect, it } from 'vitest';
import { PNG } from 'pngjs';
import QRCode from 'qrcode';
import { ESTA_INVOICE } from '../packages/core/src/vietqr/index.ts';
import { decodeQrPng } from './decode-qr.ts';

describe('decodeQrPng', () => {
  it('reads the bin, account, amount and memo back from a PNG of an invoice code', async () => {
    const image = decodeQrPng(await QRCode.toBuffer(ESTA_INVOICE.payload, { errorCorrectionLevel: 'M' }));
    expect(image?.payload).toBe(ESTA_INVOICE.payload);
    expect(image?.decoded).toEqual({
      ok: true,
      value: { initiation: 'dynamic', bin: '970436', accountNo: '0123456789', service: 'QRIBFTTA', amountVnd: 15_000_000, purpose: 'ESTA 7K2QX9MP' },
    });
  });

  it('finds no code in a blank picture', () => {
    const blank = new PNG({ width: 64, height: 64 });
    blank.data.fill(255);
    expect(decodeQrPng(PNG.sync.write(blank))).toBeNull();
  });
});
