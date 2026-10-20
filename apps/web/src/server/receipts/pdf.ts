import 'server-only';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import { qrMatrix } from '@/lib/qr';
import type { ColorToken } from '@/design/tokens';
import { A5_PT, receiptColor, receiptFont, type Receipt } from './kit';

const MARGIN = 32;
const LABEL_COLUMN = 92;
const QR_PT = 104;

const tone = (token: ColorToken): RGB => {
  const [r, g, b] = receiptColor(token);
  return rgb(r / 255, g / 255, b / 255);
};

/** Words that fit `width` per line; a word wider than the line keeps its own line rather than breaking a name. */
function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line === '' ? word : `${line} ${word}`;
    if (line !== '' && font.widthOfTextAtSize(next, size) > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  return [...lines, line];
}

type Pen = { page: PDFPage; regular: PDFFont; bold: PDFFont; y: number };
type Style = { font?: 'regular' | 'bold'; size?: number; color?: ColorToken };

const LEFT = MARGIN;
const RIGHT = A5_PT.width - MARGIN;

/** Draws wrapped text from the pen's line down and moves the pen below it. */
function text(pen: Pen, value: string, x: number, width: number, { font = 'regular', size = 10, color = 'ink' }: Style = {}): void {
  const face = font === 'bold' ? pen.bold : pen.regular;
  for (const line of wrap(value, face, size, width)) {
    pen.page.drawText(line, { x, y: pen.y - size, size, font: face, color: tone(color) });
    pen.y -= size * 1.45;
  }
}

function rightText(pen: Pen, value: string, { font = 'regular', size = 10, color = 'ink' }: Style = {}): void {
  const face = font === 'bold' ? pen.bold : pen.regular;
  pen.page.drawText(value, { x: RIGHT - face.widthOfTextAtSize(value, size), y: pen.y - size, size, font: face, color: tone(color) });
}

function rule(pen: Pen, color: ColorToken, thickness: number): void {
  pen.page.drawLine({ start: { x: LEFT, y: pen.y }, end: { x: RIGHT, y: pen.y }, thickness, color: tone(color) });
}

/** A label on the left and its value wrapped in the column beside it. */
function field(pen: Pen, label: string, value: string, style: Style = {}): void {
  const top = pen.y;
  text(pen, label, LEFT, LABEL_COLUMN - 8, { color: 'ink-muted' });
  const below = pen.y;
  pen.y = top;
  text(pen, value, LEFT + LABEL_COLUMN, RIGHT - LEFT - LABEL_COLUMN, style);
  pen.y = Math.min(pen.y, below) - 4;
}

/** An amount row: the label wraps in the space the right-aligned amount leaves. */
function amountRow(pen: Pen, label: string, amount: string, style: Style = {}): void {
  const top = pen.y;
  const face = style.font === 'bold' ? pen.bold : pen.regular;
  text(pen, label, LEFT, RIGHT - LEFT - face.widthOfTextAtSize(amount, style.size ?? 10) - 16, style);
  const below = pen.y;
  pen.y = top;
  rightText(pen, amount, style);
  pen.y = below;
}

function qrBlock(pen: Pen, receipt: Receipt): void {
  if (receipt.qr === null) return;
  const qr = receipt.qr;
  const matrix = qrMatrix(qr.payload);
  const top = pen.y;
  pen.page.drawSvgPath(matrix.path, { x: LEFT, y: top, scale: QR_PT / matrix.size, color: tone('qr-ink'), borderWidth: 0 });
  const x = LEFT + QR_PT + 16;
  const width = RIGHT - x;
  pen.y = top;
  text(pen, receipt.labels.scanToPay, x, width, { font: 'bold' });
  text(pen, receipt.labels.memo, x, width, { color: 'ink-muted', size: 9 });
  text(pen, qr.memo, x, width, { font: 'bold', size: 12 });
  text(pen, receipt.labels.account, x, width, { color: 'ink-muted', size: 9 });
  text(pen, `${qr.bank} · ${qr.accountNo}`, x, width);
  text(pen, qr.accountName, x, width);
  pen.y = Math.min(pen.y, top - QR_PT);
}

/** LSE-6: the A5 receipt with the font embedded and subset, so its text extracts as Studio stores it. */
export async function renderReceiptPdf(receipt: Receipt): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(receipt.labels.title, { showInWindowTitleBar: true });
  pdf.setLanguage('vi-VN');
  pdf.setCreator('Esta');
  pdf.setProducer('Esta');
  const [regular, bold] = await Promise.all([pdf.embedFont(receiptFont(400), { subset: true }), pdf.embedFont(receiptFont(700), { subset: true })]);
  const page = pdf.addPage([A5_PT.width, A5_PT.height]);
  const pen: Pen = { page, regular, bold, y: A5_PT.height - MARGIN };

  rightText(pen, `${receipt.labels.number} ${receipt.number}`, { size: 9, color: 'ink-muted' });
  text(pen, receipt.header, LEFT, RIGHT - LEFT - 130, { font: 'bold', size: 12 });
  pen.y -= 4;
  rule(pen, 'ink', 1);
  pen.y -= 18;
  text(pen, receipt.labels.title, LEFT, RIGHT - LEFT, { font: 'bold', size: 20 });
  text(pen, `${receipt.labels.issuedOn} ${receipt.issuedOn}`, LEFT, RIGHT - LEFT, { size: 9, color: 'ink-muted' });
  pen.y -= 10;
  field(pen, receipt.labels.tenant, receipt.tenant, { font: 'bold' });
  field(pen, receipt.labels.place, receipt.place);
  field(pen, receipt.labels.period, receipt.period);
  pen.y -= 8;
  text(pen, receipt.labels.lines, LEFT, RIGHT - LEFT, { font: 'bold', size: 11 });
  pen.y -= 2;
  for (const line of receipt.lines) {
    amountRow(pen, line.label, line.amount);
    pen.y -= 2;
    rule(pen, 'rule-strong', 0.5);
    pen.y -= 6;
  }
  pen.y += 2;
  rule(pen, 'ink', 1);
  pen.y -= 8;
  amountRow(pen, receipt.labels.total, receipt.total, { font: 'bold', size: 14 });
  text(pen, `${receipt.labels.words} ${receipt.totalWords}`, LEFT, RIGHT - LEFT, { color: 'ink-2' });
  pen.y -= 6;
  amountRow(pen, receipt.labels.received, receipt.received);
  amountRow(pen, receipt.labels.outstanding, receipt.outstanding, { font: 'bold' });
  pen.y -= 14;
  if (receipt.paid) text(pen, receipt.labels.paidInFull, LEFT, RIGHT - LEFT, { font: 'bold', size: 12, color: 'paid' });
  else qrBlock(pen, receipt);
  return pdf.save({ useObjectStreams: true });
}
