import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = join(import.meta.dirname, '..', '..', 'fixtures', 'certificates', 'gcn_2024-low-light', 'page-2.jpg');

/**
 * A real JPEG padded after its end marker to exactly `bytes`, which every decoder ignores. The padding is random, so
 * each run's file has a new SHA-256 and never trips the duplicate warning.
 */
export function makeLargeImage(dir: string, name: string, bytes: number): string {
  const image = readFileSync(SOURCE);
  if (bytes < image.length) throw new Error(`${name}: ${bytes} bytes is smaller than the source JPEG`);
  const path = join(dir, name);
  writeFileSync(path, Buffer.concat([image, randomBytes(bytes - image.length)]));
  return path;
}
