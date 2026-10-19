/** The long side of both thumbnails, as in `scripts/seed-documents.ts`. */
export const THUMB_SIZE = 320;
/** The blur radius in CSS pixels at thumbnail size, as in `scripts/seed-documents.ts`. */
export const BLUR_RADIUS = 24;
const BLUR_SAMPLE = 12;
/**
 * The long side of the review copy, as in `scripts/seed-documents.ts`: a portrait page fills a phone's review column at
 * 2x, and zooming in loads the original for finer print.
 */
export const REVIEW_SIZE = 1024;
const REVIEW_QUALITY = 0.75;

export type Previews = { readonly thumb: Blob; readonly blurred: Blob; readonly review: Blob; readonly pageCount: number };

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

function draw(source: Source, longSide: number): HTMLCanvasElement {
  const size = fit(source.width, source.height, longSide);
  const target = canvas(size.width, size.height);
  const context = target.getContext('2d');
  if (context !== null) {
    context.imageSmoothingQuality = 'high';
    context.drawImage(source.image, 0, 0, size.width, size.height);
  }
  return target;
}

const encode = (element: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob>((resolve, reject) => element.toBlob((blob) => (blob === null ? reject(new Error(`Canvas gave no ${type}`)) : resolve(blob)), type, quality));

/** A browser that cannot encode WebP hands back PNG, which at review size outweighs the photo, so it gets JPEG. */
async function encodeReview(element: HTMLCanvasElement): Promise<Blob> {
  const webp = await encode(element, 'image/webp', REVIEW_QUALITY);
  return webp.type === 'image/webp' ? webp : encode(element, 'image/jpeg', REVIEW_QUALITY);
}

async function imageSource(file: Blob): Promise<Source> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  return { image: bitmap, width: bitmap.width, height: bitmap.height, pageCount: 1 };
}

/** Page 1 of a PDF at review size. pdf.js loads only here, by dynamic import, so it never reaches a route's initial chunk. */
async function pdfSource(file: Blob): Promise<Source> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerPort ??= new Worker(new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url), { type: 'module' });
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const pdf = await task.promise;
  try {
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: REVIEW_SIZE / Math.max(base.width, base.height) });
    const target = canvas(Math.round(viewport.width), Math.round(viewport.height));
    await page.render({ canvas: target, viewport }).promise;
    return { image: target, width: target.width, height: target.height, pageCount: pdf.numPages };
  } finally {
    void task.destroy();
  }
}

/**
 * From a photo, upright from its EXIF orientation, or from a PDF's first page: a 320 px WebP thumbnail, a blurred
 * variant, and a 1024 px review copy that the review screen shows until Mẹ zooms in. The blurred one is drawn from a
 * 12 px sample, so no detail of the clear image survives in it.
 */
export async function makePreviews(file: Blob): Promise<Previews> {
  const source = file.type === 'application/pdf' ? await pdfSource(file) : await imageSource(file);
  const review = draw(source, REVIEW_SIZE);
  const clear = draw(source, THUMB_SIZE);
  const sample = draw(source, BLUR_SAMPLE);
  const blurred = canvas(clear.width, clear.height);
  const context = blurred.getContext('2d');
  if (context !== null) {
    context.filter = `blur(${BLUR_RADIUS / 2}px)`;
    context.imageSmoothingQuality = 'high';
    context.drawImage(sample, 0, 0, clear.width, clear.height);
  }
  if ('close' in source.image && typeof source.image.close === 'function') source.image.close();
  const [thumb, blurredThumb, reviewCopy] = await Promise.all([encode(clear, 'image/webp', 0.7), encode(blurred, 'image/webp', 0.7), encodeReview(review)]);
  return { thumb, blurred: blurredThumb, review: reviewCopy, pageCount: source.pageCount };
}
