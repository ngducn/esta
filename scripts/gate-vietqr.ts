// Usage: pnpm gate:vietqr. The Phase 3 gate (SPEC §10): a VietQR for 10.000 ₫ to Ryan's own receiving
// account, for two banking apps to scan. The account comes from ESTA_GATE_* in apps/web/.env.local or the shell, which
// stay on his machine; the script prints only the bank code and the account's last four digits.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import QRCode from 'qrcode';
import type { Result } from '../packages/core/src/result.ts';
import { vnd } from '../packages/core/src/money/vnd.ts';
import { bankAccountName, bankAccountNo } from '../packages/core/src/vietqr/account.ts';
import { buildInvoiceQr } from '../packages/core/src/vietqr/invoiceQr.ts';
import { BIN } from '../packages/core/src/vietqr/rules.ts';
import { decodeQrPng } from './decode-qr.ts';
import { parseSlot } from './slot.ts';
import { slotEnv } from './slot-env.ts';

export const GATE_PNG = '/tmp/esta-gate-vietqr.png';
export const GATE_AMOUNT_VND = vnd(10_000);
export const GATE_MEMO_CODE = 'GATEQRVN';

/** The gate's QR payload for the account in `env`, built as an invoice's is: 10.000 ₫ and memo `ESTA GATEQRVN`. */
export function gatePayload(env: Readonly<Record<string, string | undefined>>): Result<string> {
  const bin = env['ESTA_GATE_BANK_BIN']?.trim() ?? '';
  const accountNo = bankAccountNo(env['ESTA_GATE_ACCOUNT_NO'] ?? '');
  const accountName = bankAccountName(env['ESTA_GATE_ACCOUNT_NAME'] ?? '');
  const missing = [
    ...(BIN.test(bin) ? [] : ['ESTA_GATE_BANK_BIN (the 6-digit NAPAS code, such as 970436 for Vietcombank)']),
    ...(accountNo === null ? ['ESTA_GATE_ACCOUNT_NO'] : []),
    ...(accountName === null ? ['ESTA_GATE_ACCOUNT_NAME'] : []),
  ];
  if (accountNo === null || accountName === null || missing.length > 0) return { ok: false, reason: `set ${missing.join(', ')}` };
  return { ok: true, value: buildInvoiceQr({ account: { bin, accountNo, accountName }, outstandingVnd: GATE_AMOUNT_VND, memoCode: GATE_MEMO_CODE }).payload };
}

if (import.meta.main) {
  const payload = gatePayload(slotEnv(join(import.meta.dirname, '..'), parseSlot(process.env.ESTA_SLOT), { withKeys: false }));
  if (!payload.ok) {
    console.error(`Put your own receiving account in apps/web/.env.local first: ${payload.reason}.`);
    process.exit(2);
  }
  await QRCode.toFile(GATE_PNG, payload.value, { errorCorrectionLevel: 'M', margin: 4, width: 720 });
  const read = decodeQrPng(readFileSync(GATE_PNG));
  if (read === null || !read.decoded.ok || read.payload !== payload.value) {
    console.error(`${GATE_PNG} did not read back as the VietQR it was written from`);
    process.exit(1);
  }
  const { bin, accountNo, amountVnd, purpose } = read.decoded.value;
  console.log(`Wrote ${GATE_PNG}: bank ${bin}, account ending ${accountNo.slice(-4)}, ${amountVnd ?? 0} VND, memo ${purpose ?? ''}.`);
  console.log('Scan it with two banking apps. Each must fill the account, 10.000 ₫ and the memo. Cancel without transferring.');
}
