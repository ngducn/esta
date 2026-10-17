import { expect, test } from 'vitest';
import { decodeVietQr } from './decode';
import { encodeVietQr } from './encode';
import { buildInvoiceQr } from './invoiceQr';
import { ENCODE_VECTORS, ESTA_INVOICE } from './vectors';

const BUDGET_MS = 0.2;

const napas = ENCODE_VECTORS[0].expected;
const napasInput = { bin: napas.bin, accountNo: napas.accountNo, amountVnd: napas.amountVnd, purpose: napas.purpose, billNumber: napas.billNumber };

test('encode plus decode stays under 0.2 ms per payload', async ({ bench }) => {
  const results = await bench.compare(
    bench('invoice: buildInvoiceQr + decodeVietQr', () => {
      decodeVietQr(buildInvoiceQr(ESTA_INVOICE.input).payload);
    }),
    bench('napas 6.3.3: encodeVietQr + decodeVietQr', () => {
      decodeVietQr(encodeVietQr(napasInput));
    }),
  );
  for (const name of ['invoice: buildInvoiceQr + decodeVietQr', 'napas 6.3.3: encodeVietQr + decodeVietQr'] as const) {
    expect(results.get(name).latency.mean, name).toBeLessThan(BUDGET_MS);
  }
});
