import jpeg from 'jpeg-js';
import type { Rng } from '../../../supabase/seed/generator/rng.ts';

export type Raster = { readonly width: number; readonly height: number; readonly data: Uint8Array };

export const VARIANTS = ['scan', 'photo', 'low-light'] as const;

export type Variant = (typeof VARIANTS)[number];

export const JPEG_QUALITY = 70;

const TABLE = [74, 66, 59] as const;

type Point = readonly [number, number];

const between = (rng: Rng, min: number, max: number): number => min + rng.next() * (max - min);

/** Solves the 3x3 homography taking each `from[i]` to `to[i]`, with h33 fixed at 1. */
function homography(from: readonly Point[], to: readonly Point[]): number[] {
  const rows: number[][] = [];
  from.forEach(([x, y], index) => {
    const [u, v] = to[index] ?? [0, 0];
    rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    rows.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  });
  for (let column = 0; column < 8; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < 8; row += 1) {
      if (Math.abs(rows[row]?.[column] ?? 0) > Math.abs(rows[pivot]?.[column] ?? 0)) pivot = row;
    }
    [rows[column], rows[pivot]] = [rows[pivot] ?? [], rows[column] ?? []];
    const lead = rows[column] ?? [];
    for (let row = 0; row < 8; row += 1) {
      const current = rows[row] ?? [];
      if (row === column) continue;
      const factor = (current[column] ?? 0) / (lead[column] ?? 1);
      for (let k = column; k < 9; k += 1) current[k] = (current[k] ?? 0) - factor * (lead[k] ?? 0);
    }
  }
  return [...rows.map((row, index) => (row[8] ?? 0) / (row[index] ?? 1)), 1];
}

function sample(source: Raster, x: number, y: number, out: Uint8Array, offset: number): void {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  if (x0 < 0 || y0 < 0 || x0 + 1 >= source.width || y0 + 1 >= source.height) {
    out[offset] = TABLE[0];
    out[offset + 1] = TABLE[1];
    out[offset + 2] = TABLE[2];
    out[offset + 3] = 255;
    return;
  }
  const fx = x - x0;
  const fy = y - y0;
  const i00 = (y0 * source.width + x0) * 4;
  const i10 = i00 + 4;
  const i01 = i00 + source.width * 4;
  const i11 = i01 + 4;
  for (let channel = 0; channel < 3; channel += 1) {
    const top = (source.data[i00 + channel] ?? 0) * (1 - fx) + (source.data[i10 + channel] ?? 0) * fx;
    const bottom = (source.data[i01 + channel] ?? 0) * (1 - fx) + (source.data[i11 + channel] ?? 0) * fx;
    out[offset + channel] = Math.round(top * (1 - fy) + bottom * fy);
  }
  out[offset + 3] = 255;
}

function photograph(page: Raster, rng: Rng): Raster {
  const { width, height } = page;
  const angle = (between(rng, 4, 8) * (rng.next() < 0.5 ? -1 : 1) * Math.PI) / 180;
  const lean = between(rng, 0.02, 0.05) * width;
  const scale = 0.86;
  const cx = width / 2 + between(rng, -12, 12);
  const cy = height / 2 + between(rng, -12, 12);
  const corners: Point[] = [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height],
  ];
  const placed = corners.map(([x, y], index): Point => {
    const inward = index < 2 ? (index === 0 ? lean : -lean) : 0;
    const dx = (x - width / 2) * scale + inward;
    const dy = (y - height / 2) * scale;
    return [cx + dx * Math.cos(angle) - dy * Math.sin(angle), cy + dx * Math.sin(angle) + dy * Math.cos(angle)];
  });
  const [h11 = 0, h12 = 0, h13 = 0, h21 = 0, h22 = 0, h23 = 0, h31 = 0, h32 = 0, h33 = 1] = homography(placed, corners);
  const glareAngle = between(rng, -0.6, 0.6);
  const glareX = between(rng, 0.3, 0.7) * width;
  const glareY = between(rng, 0.25, 0.6) * height;
  const glareWidth = between(rng, 50, 90);
  const nx = Math.cos(glareAngle);
  const ny = Math.sin(glareAngle);
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const w = h31 * x + h32 * y + h33;
      const offset = (y * width + x) * 4;
      sample(page, (h11 * x + h12 * y + h13) / w, (h21 * x + h22 * y + h23) / w, data, offset);
      const distance = (x - glareX) * nx + (y - glareY) * ny;
      const glare = 0.6 * Math.exp(-((distance / glareWidth) ** 2));
      for (let channel = 0; channel < 3; channel += 1) {
        const value = data[offset + channel] ?? 0;
        data[offset + channel] = Math.round(value + (255 - value) * glare);
      }
    }
  }
  return { width, height, data };
}

function gaussianKernel(sigma: number): number[] {
  const radius = Math.ceil(sigma * 3);
  const weights = Array.from({ length: radius * 2 + 1 }, (_, index) => Math.exp(-((index - radius) ** 2) / (2 * sigma * sigma)));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return weights.map((weight) => weight / total);
}

function blurPass(source: Raster, kernel: readonly number[], horizontal: boolean): Raster {
  const { width, height } = source;
  const radius = (kernel.length - 1) / 2;
  const data = new Uint8Array(source.data.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        let sum = 0;
        for (let k = -radius; k <= radius; k += 1) {
          const sx = horizontal ? Math.min(width - 1, Math.max(0, x + k)) : x;
          const sy = horizontal ? y : Math.min(height - 1, Math.max(0, y + k));
          sum += (source.data[(sy * width + sx) * 4 + channel] ?? 0) * (kernel[k + radius] ?? 0);
        }
        data[offset + channel] = Math.round(sum);
      }
      data[offset + 3] = 255;
    }
  }
  return { width, height, data };
}

function gaussianNoise(rng: Rng): number {
  const u = Math.max(rng.next(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng.next());
}

function dim(photo: Raster, rng: Rng): Raster {
  const kernel = gaussianKernel(1.2);
  const blurred = blurPass(blurPass(photo, kernel, true), kernel, false);
  const data = blurred.data;
  const gains = [0.62, 0.55, 0.46];
  for (let offset = 0; offset < data.length; offset += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      const value = (data[offset + channel] ?? 0) * (gains[channel] ?? 1) + gaussianNoise(rng) * 9;
      data[offset + channel] = Math.min(255, Math.max(0, Math.round(value)));
    }
  }
  return blurred;
}

export function encodeJpeg(raster: Raster): Uint8Array {
  return new Uint8Array(jpeg.encode({ width: raster.width, height: raster.height, data: raster.data }, JPEG_QUALITY).data);
}

/** The camera variants; `scan` keeps the clean page and goes into a PDF instead. */
export function degrade(page: Raster, variant: Exclude<Variant, 'scan'>, rng: Rng): Uint8Array {
  const photo = photograph(page, rng);
  return encodeJpeg(variant === 'photo' ? photo : dim(photo, rng));
}
