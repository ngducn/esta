import QRCode from 'qrcode';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export const fontDir = path.join(process.cwd(), 'fonts');
export const font = (name: string) => path.join(fontDir, name);
export const fontBuf = (name: string) => readFileSync(font(name));

export const A5_PT = { w: 419.528, h: 595.276 };

const digits = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];

function triple(n: number, full: boolean): string {
  const h = Math.floor(n / 100);
  const t = Math.floor((n % 100) / 10);
  const u = n % 10;
  const parts: string[] = [];
  if (h > 0 || full) parts.push(`${digits[h]} trăm`);
  if (t > 1) {
    parts.push(`${digits[t]} mươi`);
    if (u === 1) parts.push('mốt');
    else if (u === 5) parts.push('lăm');
    else if (u > 0) parts.push(digits[u]);
  } else if (t === 1) {
    parts.push('mười');
    if (u === 5) parts.push('lăm');
    else if (u > 0) parts.push(digits[u]);
  } else if (u > 0) {
    if (h > 0 || full) parts.push('lẻ');
    parts.push(digits[u]);
  }
  return parts.join(' ');
}

export function vndInWords(n: number): string {
  if (n === 0) return 'Không đồng';
  const units = ['', 'nghìn', 'triệu', 'tỷ'];
  const groups: number[] = [];
  let rest = n;
  while (rest > 0) {
    groups.push(rest % 1000);
    rest = Math.floor(rest / 1000);
  }
  const out: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    if (g === 0) continue;
    const full = i < groups.length - 1;
    out.push(`${triple(g, full)} ${units[i]}`.trim());
  }
  const s = `${out.join(' ')} đồng`;
  return s[0].toUpperCase() + s.slice(1);
}

export const fmtVnd = (n: number) => `${n.toLocaleString('de-DE')} ₫`;

function crc16(s: string): string {
  let crc = 0xffff;
  for (let i = 0; i < s.length; i++) {
    crc ^= s.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

const tlv = (tag: string, v: string) => `${tag}${String(v.length).padStart(2, '0')}${v}`;

export function vietQrPayload(amount: number, memo: string): string {
  const acct = tlv('00', '970422') + tlv('01', '0123456789');
  const body =
    tlv('00', '01') +
    tlv('01', '12') +
    tlv('38', tlv('00', 'A000000727') + tlv('01', acct) + tlv('02', 'QRIBFTTA')) +
    tlv('53', '704') +
    tlv('54', String(amount)) +
    tlv('58', 'VN') +
    tlv('62', tlv('08', memo)) +
    '6304';
  return body + crc16(body);
}

export const receipt = {
  household: 'Gia đình Demo',
  title: 'Biên nhận tiền thuê',
  no: 'BN-2026-10-003',
  tenant: 'Đặng Thị Hường',
  unit: 'Dãy trọ Dĩ An, Phòng 3',
  periodFrom: '01/10/2026',
  periodTo: '31/10/2026',
  lines: [
    { label: 'Tiền thuê phòng', amount: 3_500_000 },
    { label: 'Tiền điện (250 kWh)', amount: 250_000 },
    { label: 'Tiền nước', amount: 50_000 },
  ],
  memo: 'ESTA 7K2QX9MP',
};

export const total = receipt.lines.reduce((s, l) => s + l.amount, 0);
export const totalWords = vndInWords(total);

export async function qrDataUrl(): Promise<string> {
  return QRCode.toDataURL(vietQrPayload(total, receipt.memo), { margin: 1, width: 400, errorCorrectionLevel: 'M' });
}
