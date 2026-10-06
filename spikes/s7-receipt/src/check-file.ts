import { readFileSync } from 'node:fs';

const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
for (const f of process.argv.slice(2)) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(f)) }).promise;
  const tc = await (await doc.getPage(1)).getTextContent();
  const text = tc.items.map((i: any) => i.str).join(' ');
  console.log(`${f}: ${text.includes('Đặng Thị Hường') ? 'PASS' : 'FAIL'} tenant name in extracted text`);
}
