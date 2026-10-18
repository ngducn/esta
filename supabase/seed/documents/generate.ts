import { Resvg } from '@resvg/resvg-js';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';

/** Writes the synthetic seed documents that are not certificates. Run with `pnpm exec tsx supabase/seed/documents/generate.ts`. */
const here = import.meta.dirname;
const fonts = join(here, '..', '..', '..', 'fixtures', 'certificates', 'generator', 'fonts');
const fontFiles = [join(fonts, 'BeVietnamPro-Regular.ttf'), join(fonts, 'BeVietnamPro-Bold.ttf')];

type Line = { text: string; size: number; bold?: boolean };

function page(width: number, height: number, lines: readonly Line[], frame: string): Buffer {
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

async function pdf(pages: readonly Buffer[]): Promise<Uint8Array> {
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

const A4 = [1240, 1754] as const;
const insurance = [
  page(...A4, [
    { text: 'GIẤY CHỨNG NHẬN BẢO HIỂM CHÁY NỔ (DEMO)', size: 40, bold: true },
    { text: 'Tài sản: Nhà phố Q7, đường số 15 Demo, Quận 7', size: 30 },
    { text: 'Người được bảo hiểm: Nguyễn Thị Demo', size: 30 },
    { text: 'Thời hạn: từ 31/10/2025 đến 30/10/2026', size: 30 },
    { text: 'Số tiền bảo hiểm: 1.500.000.000 đồng', size: 30 },
    { text: 'Tài liệu tổng hợp để thử nghiệm, không có giá trị pháp lý.', size: 24 },
  ], '#b83a26'),
];
const lease = [1, 2].map((n) =>
  page(...A4, [
    { text: n === 1 ? 'HỢP ĐỒNG THUÊ CĂN HỘ (DEMO)' : 'ĐIỀU KHOẢN CHUNG (DEMO)', size: 40, bold: true },
    { text: 'Căn hộ Thủ Đức, Thành phố Thủ Đức', size: 30 },
    { text: 'Bên cho thuê: Nguyễn Thị Demo và Trần Minh Demo', size: 30 },
    { text: `Trang ${n} / 2`, size: 26 },
    { text: 'Tài liệu tổng hợp để thử nghiệm, không có giá trị pháp lý.', size: 24 },
  ], '#2f5d8a'),
);
const idCard = page(1012, 638, [
  { text: 'CĂN CƯỚC CÔNG DÂN (DEMO)', size: 40, bold: true },
  { text: 'Họ và tên: NGUYỄN THỊ DEMO', size: 30 },
  { text: 'Số: ••••••••3456', size: 30 },
  { text: 'Thẻ tổng hợp để thử nghiệm.', size: 24 },
], '#3f7d4e');

writeFileSync(join(here, 'bao-hiem-q7.pdf'), await pdf(insurance));
writeFileSync(join(here, 'bao-hiem-q7.page-1.png'), insurance[0] ?? Buffer.alloc(0));
writeFileSync(join(here, 'hop-dong-thue-thu-duc.pdf'), await pdf(lease));
writeFileSync(join(here, 'hop-dong-thue-thu-duc.page-1.png'), lease[0] ?? Buffer.alloc(0));
writeFileSync(join(here, 'cccd-demo.png'), idCard);
console.log('Wrote the seed documents to', here);
