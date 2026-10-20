import fontkit from '@pdf-lib/fontkit';
import { buildReceiptModel } from '@esta/core/receipt';
import { isoDate } from '@esta/core/date';
import { vnd } from '@esta/core/money';
import { PDFDocument } from 'pdf-lib';
import { PNG } from 'pngjs';
import { describe, expect, it, vi } from 'vitest';
import { decodeQrPng } from '../../../../../scripts/decode-qr';
import { pdfPagePngs } from '../../../../../scripts/pdf-pages.mjs';
import { pdfText } from '../../../../../scripts/receipt-text';
import { A5_PT, PNG_PX, receiptFonts, type ReceiptLabels } from './kit';
import { renderReceiptPdf } from './pdf';
import { renderReceiptPng } from './png';

vi.mock('server-only', () => ({}));

const labels: ReceiptLabels = {
  title: 'Biên nhận tiền thuê',
  number: 'Số',
  issuedOn: 'Ngày lập',
  tenant: 'Người thuê',
  place: 'Nơi thuê',
  period: 'Kỳ thuê',
  lines: 'Các khoản',
  total: 'Tổng cộng',
  words: 'Bằng chữ:',
  received: 'Đã nhận',
  outstanding: 'Còn lại',
  paidInFull: 'Đã nhận đủ tiền kỳ này',
  scanToPay: 'Quét mã VietQR để chuyển phần còn lại',
  memo: 'Nội dung chuyển khoản',
  account: 'Tài khoản nhận',
};

const PAYLOAD = '00020101021238540010A00000072701240006970436011001234567890208QRIBFTTA53037045406350000058025VN62170813ESTA 7K2QX9MP6304ABCD';

/** The fixture tenant typed decomposed, as some phone keyboards send it; the receipt must print it in NFC. */
const input = {
  header: 'Nhà trọ Dĩ An Demo',
  number: 'HD-2026-10-003',
  issuedOn: isoDate('2026-10-07'),
  tenant: 'Đặng Thị Hường Demo'.normalize('NFD'),
  place: 'Phòng 3, Nhà trọ Dĩ An Demo',
  periodStart: isoDate('2026-10-01'),
  periodEnd: isoDate('2026-10-31'),
  lines: [
    { label: 'Tiền thuê', amountVnd: vnd(3_500_000) },
    { label: 'Tiền nước', amountVnd: vnd(150_000) },
    { label: 'Phí rác', amountVnd: vnd(30_000) },
  ],
  totalVnd: vnd(3_680_000),
  receivedVnd: vnd(180_000),
  outstandingVnd: vnd(3_500_000),
  qr: { payload: PAYLOAD, memo: 'ESTA 7K2QX9MP', bank: 'Vietcombank', accountNo: '0123456789', accountName: 'NGUYEN THI DEMO' },
  labels,
};
const unpaid = buildReceiptModel(input);

describe('renderReceiptPdf', () => {
  it('extracts the tenant, title, total and words in NFC from an A5 page (LSE-6)', async () => {
    const bytes = await renderReceiptPdf(unpaid);
    const text = await pdfText(bytes);
    expect(text).toContain('Đặng Thị Hường Demo');
    expect(text).not.toContain('Đặng Thị Hường Demo'.normalize('NFD'));
    // pdf.js reads the no-break space before ₫ back as a plain space.
    for (const expected of ['Biên nhận tiền thuê', 'Tiền thuê', '3.500.000 ₫', '3.680.000 ₫', 'Ba triệu sáu trăm tám mươi nghìn đồng', 'ESTA 7K2QX9MP']) {
      expect(text).toContain(expected);
    }
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
    const { width, height } = pdf.getPage(0).getSize();
    expect([width, height]).toEqual([A5_PT.width, A5_PT.height]);
    expect(pdf.getTitle()).toBe('Biên nhận tiền thuê');
  });

  it('wraps a long name inside the margin and prints a paid bill without a code', async () => {
    const paid = buildReceiptModel({ ...input, tenant: 'Tôn Nữ Thị Phương Hoàng Demo Tôn Nữ Thị Phương Hoàng', receivedVnd: vnd(3_680_000), outstandingVnd: vnd(0) });
    const text = await pdfText(await renderReceiptPdf(paid));
    expect(text).toContain('Đã nhận đủ tiền kỳ này');
    expect(text).not.toContain('ESTA 7K2QX9MP');
    expect(text).toContain('Tôn Nữ Thị');
  });
});

describe('renderReceiptPng', () => {
  it('draws a 1080 × 1527 picture whose code a bank app reads', async () => {
    const bytes = await renderReceiptPng(unpaid);
    const png = PNG.sync.read(bytes);
    expect([png.width, png.height]).toEqual([PNG_PX.width, PNG_PX.height]);
    expect(decodeQrPng(bytes)?.payload).toBe(PAYLOAD);
  });
});

/** Twelve charges, as a month with meter readings and fees brings, under a long name and a long place. */
const long = buildReceiptModel({
  ...input,
  tenant: 'Tôn Nữ Thị Phương Hoàng Jürgen Müller Núñez Demo',
  place: 'Phòng 12A, Khu nhà trọ cho thuê dài hạn đường Nguyễn Văn Linh, phường Dĩ An Demo',
  lines: [
    'Tiền thuê',
    'Tiền điện 120 kWh',
    'Tiền nước 5 m³',
    'Phí rác',
    'Phí gửi xe máy',
    'Phí internet',
    'Phí vệ sinh khu chung hằng tháng của dãy trọ',
    'Phí thang máy',
    'Phí bảo vệ',
    'Tiền điện tháng trước còn thiếu',
    'Phí sửa vòi nước',
    'Điều chỉnh',
  ].map((label, index) => ({ label, amountVnd: vnd(index === 0 ? 3_500_000 : 10_000 * index) })),
  totalVnd: vnd(4_160_000),
  receivedVnd: vnd(0),
  outstandingVnd: vnd(4_160_000),
});

describe('a long receipt', () => {
  it('keeps every line and a scannable code in the PDF, on as many A5 pages as it needs', async () => {
    const bytes = await renderReceiptPdf(long);
    const text = await pdfText(bytes);
    for (const line of long.lines) expect(text).toContain(line.label);
    for (const expected of [long.tenant, 'm³', 'Jürgen Müller Núñez Demo', 'ESTA 7K2QX9MP', 'NGUYEN THI DEMO']) expect(text).toContain(expected);
    expect(text).not.toContain('\u0000');
    const pdf = await PDFDocument.load(bytes);
    for (const page of pdf.getPages()) expect(page.getSize()).toEqual({ width: A5_PT.width, height: A5_PT.height });
    const codes = (await pdfPagePngs(bytes)).map((page) => decodeQrPng(page)?.payload ?? null);
    expect(codes.filter((code) => code !== null)).toEqual([PAYLOAD]);
  });

  it('grows the picture taller instead of cutting off the code', async () => {
    const bytes = await renderReceiptPng(long);
    const png = PNG.sync.read(bytes);
    expect(png.width).toBe(PNG_PX.width);
    expect(png.height).toBeGreaterThan(PNG_PX.height);
    expect(decodeQrPng(bytes)?.payload).toBe(PAYLOAD);
  });

  it('draws every character it prints from the bundled fonts, so nothing falls back to a blank box', () => {
    const printed = [long.header, long.number, long.tenant, long.place, long.period, long.total, long.totalWords, ...long.lines.flatMap((line) => [line.label, line.amount]), ...Object.values(long.labels)].join('');
    const codePoints = [...new Set(printed)].map((character) => character.codePointAt(0) ?? 0);
    for (const font of receiptFonts()) {
      const face = fontkit.create(font.data);
      expect(codePoints.filter((point) => !face.hasGlyphForCodePoint(point)).map((point) => String.fromCodePoint(point))).toEqual([]);
    }
  });
});
