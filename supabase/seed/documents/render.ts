import { Resvg } from '@resvg/resvg-js';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';

const fonts = join(import.meta.dirname, '..', '..', '..', 'fixtures', 'certificates', 'generator', 'fonts');
const fontFiles = [join(fonts, 'BeVietnamPro-Regular.ttf'), join(fonts, 'BeVietnamPro-Bold.ttf')];

export type Line = { text: string; size: number; bold?: boolean };

/** One page of text on a framed sheet, in Be Vietnam Pro, as a PNG. */
export function page(width: number, height: number, lines: readonly Line[], frame: string): Buffer {
  let y = 90;
  const text = lines
    .map(({ text, size, bold }) => {
      y += size * 1.7;
      const escaped = text.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
      return `<text x="70" y="${y}" font-family="Be Vietnam Pro" font-size="${size}" font-weight="${bold === true ? 700 : 400}" fill="#1f1a17">${escaped}</text>`;
    })
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#fbf8f2"/><rect x="30" y="30" width="${width - 60}" height="${height - 60}" fill="none" stroke="${frame}" stroke-width="6"/>${text}</svg>`;
  return Buffer.from(new Resvg(svg, { font: { loadSystemFonts: false, fontFiles, defaultFontFamily: 'Be Vietnam Pro' } }).render().asPng());
}

/** The pages as a PDF with fixed dates, so a rerun writes the same bytes. */
export async function pdf(pages: readonly Buffer[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setCreationDate(new Date(Date.UTC(2026, 9, 7)));
  doc.setModificationDate(new Date(Date.UTC(2026, 9, 7)));
  doc.setProducer('esta seed');
  doc.setCreator('esta seed');
  for (const png of pages) {
    const image = await doc.embedPng(png);
    doc.addPage([image.width / 2, image.height / 2]).drawImage(image, { x: 0, y: 0, width: image.width / 2, height: image.height / 2 });
  }
  return doc.save({ useObjectStreams: false });
}

export const A4 = [1240, 1754] as const;
