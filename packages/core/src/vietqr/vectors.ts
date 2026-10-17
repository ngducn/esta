import { vnd } from '../money/vnd';
import type { DecodeFault } from './decode';
import type { VietQr } from './encode';
import type { InvoiceQrInput } from './invoiceQr';

// Ported from spike S4 (branch spike/s4-vietqr at a7c9e76, spikes/s4-vietqr/test/vectors.ts).

export type Vector = { id: string; source: string; payload: string; expected: VietQr };

export type MalformedVector = { id: string; source: string; payload: string; reason: string; fault: DecodeFault };

const NAPAS_SPEC =
  'NAPAS, Technical Specifications on NAPAS QR Switching v1.5.2 (QR_Format_T&C_v1.5.2_EN_102022.pdf), https://vietqr.net/portal-service/download/documents/QR_Format_T&C_v1.5.2_EN_102022.pdf';
const VIETNAM_QR_PAY = 'vietnam-qr-pay 1.5.1 README (MIT), https://www.npmjs.com/package/vietnam-qr-pay';

// Published payloads the encoder reproduces byte for byte.
export const ENCODE_VECTORS = [
  {
    id: 'napas-6.3.3-dynamic-account',
    source: `${NAPAS_SPEC} section 6.3.3`,
    payload:
      '00020101021238570010A00000072701270006970403011300110123456780208QRIBFTTA530370454061800005802VN62340107NPS68690819thanh toan don hang63042E2E',
    expected: {
      initiation: 'dynamic',
      bin: '970403',
      accountNo: '0011012345678',
      service: 'QRIBFTTA',
      amountVnd: vnd(180_000),
      billNumber: 'NPS6869',
      purpose: 'thanh toan don hang',
    },
  },
  {
    id: 'vietnam-qr-pay-static',
    source: `${VIETNAM_QR_PAY} "Tạo mã QR tĩnh"`,
    payload: '00020101021138530010A0000007270123000697041601092576788590208QRIBFTTA53037045802VN6304AE9F',
    expected: { initiation: 'static', bin: '970416', accountNo: '257678859', service: 'QRIBFTTA' },
  },
  {
    id: 'vietnam-qr-pay-dynamic',
    source: `${VIETNAM_QR_PAY} "Tạo mã QR động"`,
    payload:
      '00020101021238530010A0000007270123000697041601092576788590208QRIBFTTA53037045405100005802VN62150811Chuyen tien630453E6',
    expected: {
      initiation: 'dynamic',
      bin: '970416',
      accountNo: '257678859',
      service: 'QRIBFTTA',
      amountVnd: vnd(10_000),
      purpose: 'Chuyen tien',
    },
  },
  {
    id: 'vietnam-qr-pay-edited',
    source: `${VIETNAM_QR_PAY} "Chỉnh sửa mã QR"`,
    payload:
      '00020101021238530010A0000007270123000697041601092576788590208QRIBFTTA530370454069999995802VN62140810Cam on nhe6304E786',
    expected: {
      initiation: 'dynamic',
      bin: '970416',
      accountNo: '257678859',
      service: 'QRIBFTTA',
      amountVnd: vnd(999_999),
      purpose: 'Cam on nhe',
    },
  },
  {
    id: 'viblo-tpbank-alias',
    source:
      'Viblo, "Tạo mã QRCode chuyển tiền ngân hàng", https://viblo.asia/p/tao-ma-qrcode-chuyen-tien-ngan-hang-7ymJXnd5Vkq',
    payload:
      '00020101021238530010A000000727012300069704230109mynamebvh0208QRIBFTTA53037045405500005802VN62080804test6304AB76',
    expected: {
      initiation: 'dynamic',
      bin: '970423',
      accountNo: 'mynamebvh',
      service: 'QRIBFTTA',
      amountVnd: vnd(50_000),
      purpose: 'test',
    },
  },
  {
    id: 'vietqr-vn-virtual-account',
    source:
      'api.vietqr.vn developer docs export, https://api.vietqr.vn/llms-full.txt ("qrCode" response sample, Test VA Account)',
    payload:
      '00020101021238570010A000000727012700069704220113VQRQACYEK56060208QRIBFTTA5303704540468685802VN62300107NPS68690815Test VA Account6304BE01',
    expected: {
      initiation: 'dynamic',
      bin: '970422',
      accountNo: 'VQRQACYEK5606',
      service: 'QRIBFTTA',
      amountVnd: vnd(6_868),
      billNumber: 'NPS6869',
      purpose: 'Test VA Account',
    },
  },
] as const satisfies readonly Vector[];

// Card transfers (QRIBFTTC) the decoder accepts; the encoder emits only QRIBFTTA.
export const DECODE_ONLY_VECTORS = [
  {
    id: 'napas-6.3.2-static-card',
    source: `${NAPAS_SPEC} section 6.3.2`,
    payload: '00020101021138600010A00000072701300006970403011697040311012345670208QRIBFTTC53037045802VN63044F52',
    expected: { initiation: 'static', bin: '970403', accountNo: '9704031101234567', service: 'QRIBFTTC' },
  },
  {
    id: 'napas-6.3.4-dynamic-card',
    source: `${NAPAS_SPEC} section 6.3.4, field table (the one-line string above it prints 010211 and drops 54 and 62; CRC A203 matches the table)`,
    payload:
      '00020101021238600010A00000072701300006970403011697040311012345670208QRIBFTTC530370454061800005802VN62340107NPS68690819thanh toan don hang6304A203',
    expected: {
      initiation: 'dynamic',
      bin: '970403',
      accountNo: '9704031101234567',
      service: 'QRIBFTTC',
      amountVnd: vnd(180_000),
      billNumber: 'NPS6869',
      purpose: 'thanh toan don hang',
    },
  },
] as const satisfies readonly Vector[];

export const NAPAS_6_3_1_WELL_FORMED =
  '00020101021138570010A00000072701270006970403011300110123456780208QRIBFTTA53037045802VN63049E6F';

export const MALFORMED_VECTORS = [
  {
    id: 'napas-6.3.1-static-account-as-printed',
    source: `${NAPAS_SPEC} section 6.3.1`,
    payload: '00020101021138570010A00000072701270006970403011200110123456780208QRIBFTTA53037045802VN6304F4E5',
    reason: 'CRC F4E5 is right for the printed bytes, but 38.01.01 declares length 12 for the 13-character account 0011012345678',
    fault: { kind: 'malformed', path: '38.01', offset: 26 },
  },
  {
    id: 'vietqr-vn-sample-bad-length',
    source: 'api.vietqr.vn developer docs export, https://api.vietqr.vn/llms-full.txt (SampleTransactionDescription sample)',
    payload:
      '00020101021138540010A00000072701240006970422011012345678900208QRIBFTTA53037045405200005802VN62350831SampleTransactionDescription6304AAB8',
    reason: 'printed CRC AAB8 does not match, and tag 62.08 declares 31 characters for a 28-character value',
    fault: { kind: 'crc_mismatch', expected: 'D3DF', found: 'AAB8' },
  },
] as const satisfies readonly MalformedVector[];

// The synthetic invoice from the S4 PNG round trip (spikes/s4-vietqr/out/roundtrip.json).
export const ESTA_INVOICE = {
  input: {
    account: { bin: '970436', accountNo: '0123456789', accountName: 'NGUYEN THI DEMO' },
    outstandingVnd: vnd(15_000_000),
    memoCode: '7K2QX9MP',
  } satisfies InvoiceQrInput,
  purpose: 'ESTA 7K2QX9MP',
  payload:
    '00020101021238540010A00000072701240006970436011001234567890208QRIBFTTA53037045408150000005802VN62170813ESTA 7K2QX9MP6304BB90',
};
