import { PDFDocument, rgb, PDFFont } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { fontBuf, receipt, total, totalWords, fmtVnd, qrDataUrl, A5_PT } from './data.ts';

export async function renderPdfLib(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(receipt.title);
  pdf.setLanguage('vi');
  const sans = await pdf.embedFont(fontBuf('BeVietnamPro-Regular.ttf'), { subset: true });
  const sansB = await pdf.embedFont(fontBuf('BeVietnamPro-Bold.ttf'), { subset: true });
  const serif = await pdf.embedFont(fontBuf('Newsreader-Medium.ttf'), { subset: true });
  const serifB = await pdf.embedFont(fontBuf('Newsreader-Bold.ttf'), { subset: true });
  const qrPng = await pdf.embedPng(Buffer.from((await qrDataUrl()).split(',')[1], 'base64'));

  const page = pdf.addPage([A5_PT.w, A5_PT.h]);
  const M = 28;
  const R = A5_PT.w - M;
  const ink = rgb(0.165, 0.137, 0.125);
  const mute = rgb(0.42, 0.37, 0.345);
  let y = A5_PT.h - M - 12;

  const left = (t: string, f: PDFFont, size: number, x: number, yy: number, color = ink) =>
    page.drawText(t, { x, y: yy, size, font: f, color });
  const right = (t: string, f: PDFFont, size: number, yy: number, color = ink) =>
    page.drawText(t, { x: R - f.widthOfTextAtSize(t, size), y: yy, size, font: f, color });
  const rule = (yy: number, w: number, color = ink) =>
    page.drawLine({ start: { x: M, y: yy }, end: { x: R, y: yy }, thickness: w, color });

  left(receipt.household, serifB, 16, M, y);
  right(`Số ${receipt.no}`, sans, 10, y, mute);
  y -= 10;
  rule(y, 1);
  y -= 34;
  left(receipt.title, serifB, 22, M, y);
  y -= 28;
  for (const [k, v] of [
    ['Người thuê', receipt.tenant],
    ['Căn thuê', receipt.unit],
    ['Kỳ', `${receipt.periodFrom} đến ${receipt.periodTo}`],
  ] as const) {
    left(k, sans, 10, M, y, mute);
    right(v, sans, 10, y);
    y -= 19;
  }
  y -= 6;
  for (const l of receipt.lines) {
    left(l.label, sans, 10, M, y);
    right(fmtVnd(l.amount), serif, 13, y);
    y -= 7;
    rule(y, 0.5, rgb(0.81, 0.78, 0.74));
    y -= 14;
  }
  rule(y + 8, 1);
  y -= 10;
  left('Tổng cộng', sansB, 10, M, y);
  right(fmtVnd(total), serifB, 22, y);
  y -= 22;
  left(`Bằng chữ: ${totalWords}`, sans, 10, M, y);
  y -= 130;
  page.drawImage(qrPng, { x: M, y, width: 110, height: 110 });
  left('Quét mã VietQR để chuyển khoản', sansB, 10, M + 124, y + 62);
  left(`Nội dung: ${receipt.memo}`, sans, 10, M + 124, y + 46);
  return pdf.save();
}
