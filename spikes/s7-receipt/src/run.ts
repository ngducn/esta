import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { renderReactPdf } from './reactpdf.tsx';
import { renderPdfLib } from './pdflib.ts';
import { renderPng } from './png.tsx';
import { vietQrPayload, total, receipt, totalWords } from './data.ts';

const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const { createCanvas } = await import('@napi-rs/canvas');
const require = createRequire(import.meta.url);
const stdDir = require.resolve('pdfjs-dist/package.json').replace('package.json', '');

async function extract(buf: Uint8Array) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), standardFontDataUrl: stdDir + 'standard_fonts/' }).promise;
  const page = await doc.getPage(1);
  const tc = await page.getTextContent();
  const text = tc.items.map((i: any) => i.str).join(' ');
  const vp = page.getViewport({ scale: 2 });
  const canvas = createCanvas(Math.round(vp.width), Math.round(vp.height));
  await page.render({ canvasContext: canvas.getContext('2d') as any, viewport: vp, canvas: canvas as any }).promise;
  return { text, png: canvas.toBuffer('image/png'), pages: doc.numPages, w: page.view[2], h: page.view[3] };
}

async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const s = performance.now();
  const r = await fn();
  console.log(`${label}: ${(performance.now() - s).toFixed(0)} ms`);
  return r;
}

const png = await timed('satori+resvg PNG cold', () => renderPng());
writeFileSync('out/receipt.png', png);
await timed('satori+resvg PNG warm', () => renderPng());

const variants: Record<string, () => Promise<Uint8Array>> = {
  'a-reactpdf': renderReactPdf,
  'b-pdflib': renderPdfLib,
};
const needles = ['Đặng Thị Hường', 'Gia đình Demo', 'Dãy trọ Dĩ An', 'Biên nhận tiền thuê', 'Ba triệu tám trăm nghìn đồng', 'ESTA 7K2QX9MP', '3.500.000 ₫'];
for (const [name, fn] of Object.entries(variants)) {
  const buf = await timed(`${name} PDF cold`, fn);
  await timed(`${name} PDF warm`, fn);
  writeFileSync(`out/receipt-${name}.pdf`, buf);
  const x = await extract(buf);
  writeFileSync(`out/receipt-${name}-page1.png`, x.png);
  console.log(`${name}: ${buf.length} bytes, pages=${x.pages}, view=${x.w}x${x.h}pt`);
  console.log(`${name} extracted: ${JSON.stringify(x.text)}`);
  for (const n of needles) console.log(`  ${x.text.includes(n) ? 'PASS' : 'FAIL'} contains ${JSON.stringify(n)}`);
}
console.log('qr payload', vietQrPayload(total, receipt.memo), '|', totalWords);
