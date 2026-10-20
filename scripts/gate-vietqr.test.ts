import { describe, expect, it } from 'vitest';
import { decodeVietQr } from '../packages/core/src/vietqr/index.ts';
import { gatePayload } from './gate-vietqr.ts';

// The seed's Demo account, never a real one (CLAUDE.md, Data hygiene).
const DEMO = { ESTA_GATE_BANK_BIN: '970436', ESTA_GATE_ACCOUNT_NO: '0123 456 789', ESTA_GATE_ACCOUNT_NAME: 'Nguyễn Thị Demo' };

describe('gatePayload', () => {
  it('asks for 10.000 ₫ with memo ESTA GATEQRVN to the account in the environment', () => {
    const payload = gatePayload(DEMO);
    expect(payload.ok && decodeVietQr(payload.value)).toEqual({
      ok: true,
      value: { initiation: 'dynamic', bin: '970436', accountNo: '0123456789', service: 'QRIBFTTA', amountVnd: 10_000, purpose: 'ESTA GATEQRVN' },
    });
  });

  it('names every setting that is missing or unusable, and no value', () => {
    expect(gatePayload({ ESTA_GATE_BANK_BIN: '9704', ESTA_GATE_ACCOUNT_NAME: '  ' })).toEqual({
      ok: false,
      reason: 'set ESTA_GATE_BANK_BIN (the 6-digit NAPAS code, such as 970436 for Vietcombank), ESTA_GATE_ACCOUNT_NO, ESTA_GATE_ACCOUNT_NAME',
    });
  });
});
