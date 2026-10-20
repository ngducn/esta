import { createCanvas } from '@napi-rs/canvas';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

// JavaScript with its types in pdf-pages.d.mts: pdf.js types its canvas as the DOM's HTMLCanvasElement, which the
// Node canvas it draws on in Node is not, so TypeScript could only accept this call through a cast.

/** Each page of a PDF drawn as a PNG at `scale` × 72 dpi, as a phone's camera or a printer sees it. */
export async function pdfPagePngs(bytes, scale = 3) {
  const task = getDocument({ data: Uint8Array.from(bytes), verbosity: 0 });
  try {
    const pdf = await task.promise;
    const pages = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height));
      await page.render({ canvas, viewport }).promise;
      pages.push(canvas.toBuffer('image/png'));
    }
    return pages;
  } finally {
    await task.destroy();
  }
}
