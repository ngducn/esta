import { describe, expect, it } from 'vitest';
import { isoDate } from '../date/iso-date';
import { vnd } from '../money/vnd';
import { buildReceiptModel, receiptKind, type ReceiptInput } from './model';

const decomposed = 'Đặng Thị Hường Demo'.normalize('NFD');

const partPaid: ReceiptInput<{ received: string }> = {
  header: 'Nhà Demo',
  number: 'HD-2026-10-003',
  issuedOn: isoDate('2026-10-07'),
  tenant: decomposed,
  place: 'Phòng 3 · Nhà trọ Dĩ An Demo',
  periodStart: isoDate('2026-10-01'),
  periodEnd: isoDate('2026-10-31'),
  lines: [
    { label: 'Tiền thuê', amountVnd: vnd(3_500_000) },
    { label: 'Tiền điện', amountVnd: vnd(420_000) },
  ],
  totalVnd: vnd(3_920_000),
  receivedVnd: vnd(1_000_000),
  outstandingVnd: vnd(2_920_000),
  qr: { payload: '000201', memo: 'ESTA 7K2QX9MP', bank: 'Vietcombank', accountNo: '0123456789', accountName: 'NGUYEN THI DEMO' },
  titles: { notice: 'Thông báo tiền thuê'.normalize('NFD'), receipt: 'Biên nhận tiền thuê'.normalize('NFD') },
  labels: { received: 'Đã nhận' },
};

describe('buildReceiptModel', () => {
  it('prints a part-paid bill as a receipt with its words, what was received and the code to pay the rest', () => {
    const model = buildReceiptModel(partPaid);
    expect(model.tenant).toBe('Đặng Thị Hường Demo');
    expect(model.tenant).toBe(model.tenant.normalize('NFC'));
    expect(model.kind).toBe('receipt');
    expect(model.title).toBe('Biên nhận tiền thuê');
    expect(model.total).toBe('3.920.000\u00a0₫');
    expect(model.totalWords).toBe('Ba triệu chín trăm hai mươi nghìn đồng');
    expect(model.received).toBe('1.000.000\u00a0₫');
    expect(model.outstanding).toBe('2.920.000\u00a0₫');
    expect(model.period).toBe('01/10/2026 – 31/10/2026');
    expect(model.issuedOn).toBe('07/10/2026');
    expect(model.lines).toEqual([
      { label: 'Tiền thuê', amount: '3.500.000\u00a0₫' },
      { label: 'Tiền điện', amount: '420.000\u00a0₫' },
    ]);
    expect(model.paid).toBe(false);
    expect(model.qr?.memo).toBe('ESTA 7K2QX9MP');
  });

  it('prints a bill with nothing received as a notice, with no received row and the code for the whole total', () => {
    const model = buildReceiptModel({ ...partPaid, receivedVnd: vnd(0), outstandingVnd: vnd(3_920_000) });
    expect(model.kind).toBe('notice');
    expect(model.title).toBe('Thông báo tiền thuê');
    expect(model.received).toBeNull();
    expect(model.outstanding).toBe(model.total);
    expect(model.paid).toBe(false);
    expect(model.qr?.memo).toBe('ESTA 7K2QX9MP');
  });

  it('prints a paid bill as a receipt received in full with no code', () => {
    const model = buildReceiptModel({ ...partPaid, receivedVnd: vnd(3_920_000), outstandingVnd: vnd(0) });
    expect(model.kind).toBe('receipt');
    expect(model.title).toBe('Biên nhận tiền thuê');
    expect(model.paid).toBe(true);
    expect(model.received).toBe(model.total);
    expect(model.qr).toBeNull();
  });

  it('prints no words for a bill whose meter credit outweighs its rent', () => {
    const model = buildReceiptModel({ ...partPaid, totalVnd: vnd(-36_875_000), receivedVnd: vnd(0), outstandingVnd: vnd(0) });
    expect(model.total).toBe('-36.875.000\u00a0₫');
    expect(model.totalWords).toBeNull();
  });

  it('prints no code when the household has no receiving account', () => {
    expect(buildReceiptModel({ ...partPaid, qr: null }).qr).toBeNull();
  });
});

describe('receiptKind', () => {
  it.each([
    [3_920_000, 0, 'notice'],
    [3_920_000, 1, 'receipt'],
    [3_920_000, 1_000_000, 'receipt'],
    [3_920_000, 3_920_000, 'receipt'],
    [3_920_000, 4_000_000, 'receipt'],
    [0, 0, 'receipt'],
  ] as const)('a %i ₫ bill with %i ₫ received is a %s', (total, received, kind) => {
    expect(receiptKind(vnd(total), vnd(received))).toBe(kind);
  });
});
