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

type Pen = { pdf: PDFDocument; page: PDFPage; regular: PDFFont; bold: PDFFont; y: number };
type Style = { font?: 'regular' | 'bold'; size?: number; color?: ColorToken };

const LEFT = MARGIN;
const RIGHT = A5_PT.width - MARGIN;
const TOP = A5_PT.height - MARGIN;
const LEADING = 1.45;

const face = (pen: Pen, font: Style['font']) => (font === 'bold' ? pen.bold : pen.regular);
const height = (pen: Pen, value: string, width: number, { font, size = 10 }: Style = {}) => wrap(value, face(pen, font), size, width).length * size * LEADING;

/** Starts a new A5 page when `needed` points would run past the bottom margin, so a block never splits or falls off. */
function room(pen: Pen, needed: number): void {
  if (pen.y - needed >= MARGIN) return;
  pen.page = pen.pdf.addPage([A5_PT.width, A5_PT.height]);
  pen.y = TOP;
}

/** Draws wrapped text from the pen's line down and moves the pen below it. */
function text(pen: Pen, value: string, x: number, width: number, { font = 'regular', size = 10, color = 'ink' }: Style = {}): void {
  for (const line of wrap(value, face(pen, font), size, width)) {
    room(pen, size * LEADING);
    pen.page.drawText(line, { x, y: pen.y - size, size, font: face(pen, font), color: tone(color) });
    pen.y -= size * LEADING;
  }
}

function rightText(pen: Pen, value: string, { font = 'regular', size = 10, color = 'ink' }: Style = {}): void {
  const used = face(pen, font);
  pen.page.drawText(value, { x: RIGHT - used.widthOfTextAtSize(value, size), y: pen.y - size, size, font: used, color: tone(color) });
}

function rule(pen: Pen, color: ColorToken, thickness: number): void {
  pen.page.drawLine({ start: { x: LEFT, y: pen.y }, end: { x: RIGHT, y: pen.y }, thickness, color: tone(color) });
}

/** A label on the left and its value wrapped in the column beside it. */
function field(pen: Pen, label: string, value: string, style: Style = {}): void {
  room(pen, Math.max(height(pen, label, LABEL_COLUMN - 8), height(pen, value, RIGHT - LEFT - LABEL_COLUMN, style)));
  const top = pen.y;
  text(pen, label, LEFT, LABEL_COLUMN - 8, { color: 'ink-muted' });
  const below = pen.y;
  pen.y = top;
  text(pen, value, LEFT + LABEL_COLUMN, RIGHT - LEFT - LABEL_COLUMN, style);
  pen.y = Math.min(pen.y, below) - 4;
}

/** An amount row: the label wraps in the space the right-aligned amount leaves. */
function amountRow(pen: Pen, label: string, amount: string, style: Style = {}): void {
  const width = RIGHT - LEFT - face(pen, style.font).widthOfTextAtSize(amount, style.size ?? 10) - 16;
  room(pen, height(pen, label, width, style));
  const top = pen.y;
  text(pen, label, LEFT, width, style);
  const below = pen.y;
  pen.y = top;
  rightText(pen, amount, style);
  pen.y = below;
}

function qrBlock(pen: Pen, receipt: Receipt): void {
  if (receipt.qr === null) return;
  const qr = receipt.qr;
  const x = LEFT + QR_PT + 16;
  const width = RIGHT - x;
  const notes: readonly [string, Style][] = [
    [receipt.labels.scanToPay, { font: 'bold' }],
    [receipt.labels.memo, { color: 'ink-muted', size: 9 }],
    [qr.memo, { font: 'bold', size: 12 }],
    [receipt.labels.account, { color: 'ink-muted', size: 9 }],
    [`${qr.bank} · ${qr.accountNo}`, {}],
    [qr.accountName, {}],
  ];
  // The code, the transfer note and the account stay together on one page, whatever came above them.
  room(pen, Math.max(QR_PT, notes.reduce((sum, [value, style]) => sum + height(pen, value, width, style), 0)));
  const matrix = qrMatrix(qr.payload);
  const top = pen.y;
  pen.page.drawSvgPath(matrix.path, { x: LEFT, y: top, scale: QR_PT / matrix.size, color: tone('qr-ink'), borderWidth: 0 });
  for (const [value, style] of notes) text(pen, value, x, width, style);
  pen.y = Math.min(pen.y, top - QR_PT);
}

/**
 * LSE-6: the A5 receipt, or the notice while nothing is received, with the font embedded and subset, so its text
 * extracts as Studio stores it.
 */
export async function renderReceiptPdf(receipt: Receipt): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(receipt.title, { showInWindowTitleBar: true });
  pdf.setLanguage('vi-VN');
  pdf.setCreator('Esta');
  pdf.setProducer('Esta');
  const [regular, bold] = await Promise.all([pdf.embedFont(receiptFont(400), { subset: true }), pdf.embedFont(receiptFont(700), { subset: true })]);
  const pen: Pen = { pdf, page: pdf.addPage([A5_PT.width, A5_PT.height]), regular, bold, y: TOP };

  rightText(pen, `${receipt.labels.number} ${receipt.number}`, { size: 9, color: 'ink-muted' });
  text(pen, receipt.header, LEFT, RIGHT - LEFT - 130, { font: 'bold', size: 12 });
  pen.y -= 4;
  rule(pen, 'ink', 1);
  pen.y -= 18;
  text(pen, receipt.title, LEFT, RIGHT - LEFT, { font: 'bold', size: 20 });
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
  if (receipt.received !== null) amountRow(pen, receipt.labels.received, receipt.received);
  amountRow(pen, receipt.labels.outstanding, receipt.outstanding, { font: 'bold' });
  pen.y -= 14;
  if (receipt.paid) text(pen, receipt.labels.paidInFull, LEFT, RIGHT - LEFT, { font: 'bold', size: 12, color: 'paid' });
  else qrBlock(pen, receipt);
  return pdf.save({ useObjectStreams: true });
}
