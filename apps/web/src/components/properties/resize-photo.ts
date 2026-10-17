import type { Result } from '@esta/core/result';

export const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
const MAX_WIDTH = 960;
const MAX_HEIGHT = 1280;
const QUALITY = 0.8;

export type CoverMime = 'image/webp' | 'image/jpeg';
export type ResizeRefusal = 'not_image' | 'too_large' | 'unreadable';

function encode(canvas: HTMLCanvasElement, type: CoverMime): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY));
}

/**
 * Turns a phone photo into a card-size cover before any request: upright from its EXIF orientation, at most 960 px wide
 * as WebP at 0.8. A browser that cannot encode WebP (older Safari returns PNG) gets JPEG at the same quality instead.
 */
export async function resizePhoto(file: File): Promise<Result<Blob & { type: CoverMime }, ResizeRefusal>> {
  if (!file.type.startsWith('image/')) return { ok: false, reason: 'not_image' };
  if (file.size > MAX_SOURCE_BYTES) return { ok: false, reason: 'too_large' };
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
  const scale = Math.min(1, MAX_WIDTH / bitmap.width, MAX_HEIGHT / bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (context === null) {
    bitmap.close();
    return { ok: false, reason: 'unreadable' };
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const type of ['image/webp', 'image/jpeg'] as const) {
    const blob = await encode(canvas, type);
    if (blob !== null && blob.type === type) return { ok: true, value: blob as Blob & { type: CoverMime } };
  }
  return { ok: false, reason: 'unreadable' };
}
