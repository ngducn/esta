import QRCode from 'qrcode';

/** A QR code as one SVG path in module units, without the quiet zone, so the page and the saved picture draw the same marks. */
export type QrMatrix = { readonly size: number; readonly path: string };

/** Quiet zone in modules on every side (ISO/IEC 18004 asks for four). */
export const QR_QUIET_MODULES = 4;

export function qrMatrix(payload: string): QrMatrix {
  const { modules } = QRCode.create(payload, { errorCorrectionLevel: 'M' });
  const runs: string[] = [];
  for (let y = 0; y < modules.size; y++) {
    let x = 0;
    while (x < modules.size) {
      if (modules.get(y, x) === 0) {
        x++;
        continue;
      }
      const start = x;
      while (x < modules.size && modules.get(y, x) !== 0) x++;
      runs.push(`M${start} ${y}h${x - start}v1h${start - x}z`);
    }
  }
  return { size: modules.size, path: runs.join('') };
}
