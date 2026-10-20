import { describe, expect, it } from 'vitest';
import { isoDate } from '../date/iso-date';
import { vnd } from '../money/vnd';
import { buildReceiptModel, type ReceiptInput } from './model';

const decomposed = 'Đặng Thị Hường Demo'.normalize('NFD');

const unpaid: ReceiptInput<{ title: string }> = {
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
  labels: { title: 'Biên nhận tiền thuê'.normalize('NFD') },
};

describe('buildReceiptModel', () => {
  it('prints an unpaid bill with its words, what was received and the code to pay the rest', () => {
    const model = buildReceiptModel(unpaid);
    expect(model.tenant).toBe('Đặng Thị Hường Demo');
    expect(model.tenant).toBe(model.tenant.normalize('NFC'));
    expect(model.labels.title).toBe('Biên nhận tiền thuê');
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

  it('prints a paid bill as received in full with no code', () => {
    const model = buildReceiptModel({ ...unpaid, receivedVnd: vnd(3_920_000), outstandingVnd: vnd(0) });
    expect(model.paid).toBe(true);
    expect(model.received).toBe(model.total);
    expect(model.qr).toBeNull();
  });

  it('prints no code when the household has no receiving account', () => {
    expect(buildReceiptModel({ ...unpaid, qr: null }).qr).toBeNull();
  });
});
