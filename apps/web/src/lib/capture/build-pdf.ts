/** A4 width in PDF points. Each page keeps its photo's aspect ratio, so a page is never stretched or cropped. */
export const A4_WIDTH = 595.28;

export type PdfPageImage = { readonly blob: Blob; readonly width: number; readonly height: number };

/**
 * One page per JPEG, in the order given. pdf-lib loads only here, by dynamic import, so it never reaches a route's
 * initial chunk. The document carries no creation date or producer, so the same pages always give the same bytes.
 */
export async function buildPdfFromImages(pages: readonly PdfPageImage[]): Promise<Blob> {
  const { PDFDocument } = await import('pdf-lib');
  const pdf = await PDFDocument.create({ updateMetadata: false });
  for (const page of pages) {
    const image = await pdf.embedJpg(await page.blob.arrayBuffer());
    const height = (A4_WIDTH * page.height) / page.width;
    pdf.addPage([A4_WIDTH, height]).drawImage(image, { x: 0, y: 0, width: A4_WIDTH, height });
  }
  return new Blob([new Uint8Array(await pdf.save())], { type: 'application/pdf' });
}
