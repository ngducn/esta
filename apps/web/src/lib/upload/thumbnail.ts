/** The long side of both thumbnails, as in `scripts/seed-documents.ts`. */
export const THUMB_SIZE = 320;
/** The blur radius in CSS pixels at thumbnail size, as in `scripts/seed-documents.ts`. */
export const BLUR_RADIUS = 24;
const BLUR_SAMPLE = 12;

export type Thumbnails = { readonly thumb: Blob; readonly blurred: Blob; readonly pageCount: number };

type Source = { readonly image: CanvasImageSource; readonly width: number; readonly height: number; readonly pageCount: number };

function canvas(width: number, height: number): HTMLCanvasElement {
  const element = document.createElement('canvas');
  element.width = width;
  element.height = height;
  return element;
}

function fit(width: number, height: number, longSide: number) {
  const scale = Math.min(1, longSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

const toWebp = (element: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => element.toBlob((blob) => (blob === null ? reject(new Error('Canvas gave no WebP')) : resolve(blob)), 'image/webp', 0.7));

async function imageSource(file: Blob): Promise<Source> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  return { image: bitmap, width: bitmap.width, height: bitmap.height, pageCount: 1 };
}

/** Page 1 of a PDF. pdf.js loads only here, by dynamic import, so it never reaches a route's initial chunk. */
async function pdfSource(file: Blob): Promise<Source> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerPort ??= new Worker(new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url), { type: 'module' });
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const pdf = await task.promise;
  try {
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: (THUMB_SIZE * 2) / Math.max(base.width, base.height) });
    const target = canvas(Math.round(viewport.width), Math.round(viewport.height));
    await page.render({ canvas: target, viewport }).promise;
    return { image: target, width: target.width, height: target.height, pageCount: pdf.numPages };
  } finally {
    void task.destroy();
  }
}

/**
 * A 320 px WebP of the photo, upright from its EXIF orientation, or of a PDF's first page, and a blurred variant. The
 * blurred one is drawn from a 12 px sample, so no detail of the clear image survives in it.
 */
export async function makeThumbnails(file: Blob): Promise<Thumbnails> {
  const source = file.type === 'application/pdf' ? await pdfSource(file) : await imageSource(file);
  const size = fit(source.width, source.height, THUMB_SIZE);
  const clear = canvas(size.width, size.height);
  clear.getContext('2d')?.drawImage(source.image, 0, 0, size.width, size.height);

  const sample = fit(source.width, source.height, BLUR_SAMPLE);
  const small = canvas(sample.width, sample.height);
  small.getContext('2d')?.drawImage(source.image, 0, 0, sample.width, sample.height);
  const blurred = canvas(size.width, size.height);
  const context = blurred.getContext('2d');
  if (context !== null) {
    context.filter = `blur(${BLUR_RADIUS / 2}px)`;
    context.imageSmoothingQuality = 'high';
    context.drawImage(small, 0, 0, size.width, size.height);
  }
  if ('close' in source.image && typeof source.image.close === 'function') source.image.close();
  return { thumb: await toWebp(clear), blurred: await toWebp(blurred), pageCount: source.pageCount };
}
