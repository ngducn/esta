/** A 2000 px long side keeps printed text legible and a 20-page PDF well under the 25 MB upload limit. */
export const MAX_LONG_SIDE = 2000;
export const JPEG_QUALITY = 0.85;

export type DownscaledImage = { readonly blob: Blob; readonly width: number; readonly height: number };

/** The photo upright from its EXIF orientation, as a JPEG with its long side at most 2000 px. */
export async function downscaleForPdf(blob: Blob): Promise<DownscaledImage> {
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  try {
    const scale = Math.min(1, MAX_LONG_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (context === null) throw new Error('Canvas gave no 2D context');
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, width, height);
    const jpeg = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((result) => (result === null ? reject(new Error('Canvas gave no JPEG')) : resolve(result)), 'image/jpeg', JPEG_QUALITY),
    );
    return { blob: jpeg, width, height };
  } finally {
    bitmap.close();
  }
}
