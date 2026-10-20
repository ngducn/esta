import { DOCUMENT_PREVIEWS, pdfPageScale, PREVIEW_MIME, previewSize } from '@esta/core/documents/previews';

export type Previews = { readonly thumb: Blob; readonly review: Blob; readonly pageCount: number };

type Source = { readonly image: CanvasImageSource; readonly width: number; readonly height: number; readonly pageCount: number };

function canvas(width: number, height: number): HTMLCanvasElement {
  const element = document.createElement('canvas');
  element.width = width;
  element.height = height;
  return element;
}

function draw(source: Source, longSide: number): HTMLCanvasElement {
  const size = previewSize(source.width, source.height, longSide);
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
  const quality = DOCUMENT_PREVIEWS.review.quality / 100;
  const webp = await encode(element, PREVIEW_MIME, quality);
  return webp.type === PREVIEW_MIME ? webp : encode(element, 'image/jpeg', quality);
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
    const viewport = page.getViewport({ scale: pdfPageScale(base.width, base.height) });
    const target = canvas(Math.round(viewport.width), Math.round(viewport.height));
    await page.render({ canvas: target, viewport }).promise;
    return { image: target, width: target.width, height: target.height, pageCount: pdf.numPages };
  } finally {
    void task.destroy();
  }
}

/**
 * From a photo, upright from its EXIF orientation, or from a PDF's first page: a 320 px WebP thumbnail and a 1024 px
 * review copy that the review screen shows until Mẹ zooms in.
 */
export async function makePreviews(file: Blob): Promise<Previews> {
  const source = file.type === 'application/pdf' ? await pdfSource(file) : await imageSource(file);
  const review = draw(source, DOCUMENT_PREVIEWS.review.longSide);
  const clear = draw(source, DOCUMENT_PREVIEWS.thumb.longSide);
  if ('close' in source.image && typeof source.image.close === 'function') source.image.close();
  const [thumb, reviewCopy] = await Promise.all([encode(clear, PREVIEW_MIME, DOCUMENT_PREVIEWS.thumb.quality / 100), encodeReview(review)]);
  return { thumb, review: reviewCopy, pageCount: source.pageCount };
}
