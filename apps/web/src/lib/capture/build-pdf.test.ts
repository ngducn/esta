import { PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream } from 'pdf-lib';
import sharp from 'sharp';
import { expect, test } from 'vitest';
import { A4_WIDTH, buildPdfFromImages, type PdfPageImage } from './build-pdf';

async function jpeg(width: number, height: number): Promise<PdfPageImage> {
  const bytes = await sharp({ create: { width, height, channels: 3, background: { r: 200, g: 180, b: 160 } } }).jpeg().toBuffer();
  return { blob: new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }), width, height };
}

/** Each page's embedded image size and the page's own size, in page order. */
async function pagesOf(blob: Blob) {
  const pdf = await PDFDocument.load(await blob.arrayBuffer());
  return pdf.getPages().map((page) => {
    const xobjects = page.node.Resources()?.lookup(PDFName.of('XObject'), PDFDict);
    const [entry] = xobjects?.entries() ?? [];
    const image = pdf.context.lookup(entry?.[1]);
    if (!(image instanceof PDFRawStream)) throw new Error('The page holds no image');
    const dimension = (key: string) => image.dict.lookup(PDFName.of(key), PDFNumber).asNumber();
    return { image: [dimension('Width'), dimension('Height')], page: [page.getWidth(), Math.round(page.getHeight() * 100) / 100] };
  });
}

test('three images of distinct sizes make a 3-page PDF with each image on its own page, in input order (DOC-2)', async () => {
  const images = await Promise.all([jpeg(300, 400), jpeg(500, 350), jpeg(240, 240)]);
  const pdf = await buildPdfFromImages(images);
  expect(pdf.type).toBe('application/pdf');
  expect(await pagesOf(pdf)).toEqual([
    { image: [300, 400], page: [A4_WIDTH, 793.71] },
    { image: [500, 350], page: [A4_WIDTH, 416.7] },
    { image: [240, 240], page: [A4_WIDTH, A4_WIDTH] },
  ]);
});

test('a reordered input gives the reordered PDF', async () => {
  const [first, second, third] = await Promise.all([jpeg(300, 400), jpeg(500, 350), jpeg(240, 240)]);
  const pdf = await buildPdfFromImages([first, third, second].filter((image) => image !== undefined));
  expect((await pagesOf(pdf)).map((page) => page.image)).toEqual([
    [300, 400],
    [240, 240],
    [500, 350],
  ]);
});

test('the same pages give the same bytes, so a retry uploads an identical file', async () => {
  const images = await Promise.all([jpeg(300, 400), jpeg(500, 350)]);
  const [one, two] = await Promise.all([buildPdfFromImages(images), buildPdfFromImages(images)]);
  expect(Buffer.from(await one.arrayBuffer()).equals(Buffer.from(await two.arrayBuffer()))).toBe(true);
});
