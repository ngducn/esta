import { buildReceiptModel } from '@esta/core/receipt';
import { isoDate } from '@esta/core/date';
import { vnd } from '@esta/core/money';
import { PDFDocument } from 'pdf-lib';
import { PNG } from 'pngjs';
import { describe, expect, it, vi } from 'vitest';
import { decodeQrPng } from '../../../../../scripts/decode-qr';
import { pdfText } from '../../../../../scripts/receipt-text';
import { A5_PT, PNG_PX, type ReceiptLabels } from './kit';
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
