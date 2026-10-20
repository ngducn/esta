import jsQR from 'jsqr';
import { describe, expect, it } from 'vitest';
import { ESTA_INVOICE } from '@esta/core/vietqr';
import { QR_QUIET_MODULES, qrMatrix } from './qr';

/** Paints the path's runs into a bitmap, three pixels a module, the way a canvas fills it. */
function paint({ size, path }: ReturnType<typeof qrMatrix>, scale = 3) {
  const side = (size + QR_QUIET_MODULES * 2) * scale;
  const pixels = new Uint8ClampedArray(side * side * 4).fill(255);
  for (const [, x, y, width] of path.matchAll(/M(\d+) (\d+)h(\d+)/g)) {
    for (let dy = 0; dy < scale; dy++) {
      for (let dx = 0; dx < Number(width) * scale; dx++) {
        const px = (Number(x) + QR_QUIET_MODULES) * scale + dx;
        const py = (Number(y) + QR_QUIET_MODULES) * scale + dy;
        pixels.fill(0, (py * side + px) * 4, (py * side + px) * 4 + 3);
      }
    }
  }
  return { pixels, side };
}

describe('qrMatrix', () => {
  it('draws a code a scanner reads back to the same payload', () => {
    const { pixels, side } = paint(qrMatrix(ESTA_INVOICE.payload));
    expect(jsQR(pixels, side, side)?.data).toBe(ESTA_INVOICE.payload);
  });
});
