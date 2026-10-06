import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QRPay } from 'vietnam-qr-pay';
import { encodeVietQr } from '../src/vietqr.ts';
import { memoText } from '../src/memo.ts';

const esta = { bin: '970436', accountNo: '0123456789', amountVnd: 15_000_000, purpose: memoText('7K2QX9MP') };

test('vietnam-qr-pay parses the Esta invoice payload to the same fields', () => {
  const parsed = new QRPay(encodeVietQr(esta));
  assert.deepEqual(
    {
      isValid: parsed.isValid,
      initMethod: parsed.initMethod,
      bankBin: parsed.consumer.bankBin,
      bankNumber: parsed.consumer.bankNumber,
      amount: parsed.amount,
      purpose: parsed.additionalData.purpose,
      currency: parsed.currency,
      nation: parsed.nation,
    },
    {
      isValid: true,
      initMethod: '12',
      bankBin: '970436',
      bankNumber: '0123456789',
      amount: '15000000',
      purpose: 'ESTA 7K2QX9MP',
      currency: '704',
      nation: 'VN',
    },
  );
});

test('vietnam-qr-pay builds the same bytes for the Esta invoice', () => {
  const built = QRPay.initVietQR({
    bankBin: esta.bin,
    bankNumber: esta.accountNo,
    amount: String(esta.amountVnd),
    purpose: esta.purpose,
  }).build();
  assert.equal(built, encodeVietQr(esta));
});
