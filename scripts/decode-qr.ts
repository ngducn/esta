import { readFileSync } from 'node:fs';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { decodeVietQr, describeDecodeFault, type DecodeResult } from '../packages/core/src/vietqr/index.ts';

export type DecodedImage = { readonly payload: string; readonly decoded: DecodeResult };

/** The VietQR in a PNG, such as the picture `Lưu ảnh` saves, read the way a bank app's camera reads it. */
export function decodeQrPng(bytes: Buffer): DecodedImage | null {
  const png = PNG.sync.read(bytes);
  const found = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  return found === null ? null : { payload: found.data, decoded: decodeVietQr(found.data) };
}

if (import.meta.main) {
  const path = process.argv[2];
  if (path === undefined) {
    console.error('Usage: pnpm qr:decode <image.png>');
    process.exit(2);
  }
  const image = decodeQrPng(readFileSync(path));
  if (image === null) {
    console.error(`No QR code found in ${path}`);
    process.exit(1);
  }
  console.log(`payload  ${image.payload}`);
  if (!image.decoded.ok) {
    console.error(`refused  ${describeDecodeFault(image.decoded.fault)}`);
    process.exit(1);
  }
  const { initiation, bin, accountNo, service, amountVnd, purpose } = image.decoded.value;
  console.log(`crc      ok`);
  console.log(`kind     ${initiation}`);
  console.log(`bin      ${bin}`);
  console.log(`account  ${accountNo}`);
  console.log(`service  ${service}`);
  console.log(`amount   ${amountVnd ?? 'none (the payer types it)'}`);
  console.log(`purpose  ${purpose ?? 'none'}`);
}
