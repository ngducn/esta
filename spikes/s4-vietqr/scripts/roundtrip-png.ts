import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import { PNG } from 'pngjs';
import jsQRModule from 'jsqr';
import { decodeVietQr, encodeVietQr } from '../src/vietqr.ts';
import { memoText } from '../src/memo.ts';

const jsQR = jsQRModule as unknown as typeof jsQRModule.default;

const account = { bin: '970436', accountNo: '0123456789', accountName: 'NGUYEN THI DEMO' };
const payload = encodeVietQr({
  bin: account.bin,
  accountNo: account.accountNo,
  amountVnd: 15_000_000,
  purpose: memoText('7K2QX9MP'),
});

const outPath = fileURLToPath(new URL('../out/roundtrip.png', import.meta.url));
const png = await QRCode.toBuffer(payload, { type: 'png', errorCorrectionLevel: 'M', margin: 4, scale: 8 });
writeFileSync(outPath, png);

const image = PNG.sync.read(png);
const scanned = jsQR(new Uint8ClampedArray(image.data), image.width, image.height);
if (!scanned) throw new Error('jsQR found no QR code in the PNG');
const decoded = decodeVietQr(scanned.data);

console.log(
  JSON.stringify(
    {
      payload,
      payloadLength: payload.length,
      qrVersion: QRCode.create(payload, { errorCorrectionLevel: 'M' }).version,
      png: { path: 'out/roundtrip.png', width: image.width, height: image.height, bytes: png.length },
      scannedEqualsPayload: scanned.data === payload,
      decoded,
      accountNameEncoded: payload.includes(account.accountName),
    },
    null,
    2,
  ),
);
if (scanned.data !== payload || !decoded.ok) process.exit(1);
