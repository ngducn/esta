import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ReactElement } from 'react';
import type { UtilityBillV1 } from '../../../packages/core/src/agent-schemas/utility_bill_v1.ts';
import { rngFor } from '../../../supabase/seed/generator/rng.ts';
import { degrade } from './degrade.ts';
import { FIXTURE_SEED, rasterize, scanPdf } from './generate.ts';
import { Field, Heading, Line, Page, Table, type Palette } from './templates/parts.tsx';

const HERE = dirname(fileURLToPath(import.meta.url));
export const BILLS_DIR = join(HERE, '..', '..', 'utility-bills');

export type BillFacts = {
  readonly id: string;
  readonly variant: 'scan' | 'photo';
  readonly kind: 'electricity' | 'water';
  readonly provider: string;
  readonly customer_code: string;
  readonly holder_name: string;
  readonly address_text: string;
  /** YYYY-MM, the month charged for. */
  readonly period: string;
  readonly from: string;
  readonly to: string;
  readonly readings: readonly [number, number];
  readonly unit: string;
  readonly unit_price_vnd: number;
  readonly amount_vnd: number;
};

/** Two bills for Nhà phố Q7, matching its seeded utility accounts. Every name contains Demo. */
export const BILLS: readonly BillFacts[] = [
  {
    id: 'electricity-q7-scan',
    variant: 'scan',
    kind: 'electricity',
    provider: 'Điện lực Demo Tân Thuận',
    customer_code: 'PE0901000001',
    holder_name: 'Nguyễn Thị Demo',
    address_text: 'Số 901 Demo, đường số 15, phường Tân Phong, TP. Hồ Chí Minh',
    period: '2026-09',
    from: '15/08/2026',
    to: '14/09/2026',
    readings: [12_480, 12_892],
    unit: 'kWh',
    unit_price_vnd: 2_997,
    amount_vnd: 1_234_764,
  },
  {
    id: 'water-q7-photo',
    variant: 'photo',
    kind: 'water',
    provider: 'Cấp nước Demo Nhà Bè',
    customer_code: 'NB0901000001',
    holder_name: 'Nguyễn Thị Demo',
    address_text: 'Số 901 Demo, đường số 15, phường Tân Phong, TP. Hồ Chí Minh',
    period: '2026-09',
    from: '01/09/2026',
    to: '30/09/2026',
    readings: [3_105, 3_131],
    unit: 'm³',
    unit_price_vnd: 15_929,
    amount_vnd: 414_154,
  },
];

const vnd = (amount: number) => `${String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} đ`;

const palette: Palette = { paper: '#ffffff', frame: '#1b5e9b', ink: '#1a1a1a' };

function billPage(bill: BillFacts): ReactElement {
  const [previous, current] = bill.readings;
  const used = current - previous;
  const [month, year] = [bill.period.slice(5), bill.period.slice(0, 4)];
  return (
    <Page palette={palette}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', fontWeight: 700, fontSize: 26 }}>{printedProvider(bill)}</div>
        <div style={{ display: 'flex', justifyContent: 'center', fontWeight: 700, fontSize: 32, margin: '24px 0' }}>
          {bill.kind === 'electricity' ? 'HÓA ĐƠN TIỀN ĐIỆN' : 'HÓA ĐƠN TIỀN NƯỚC'}
        </div>
        <Line>{`Kỳ hóa đơn: Tháng ${month}/${year} (từ ${bill.from} đến ${bill.to})`}</Line>
        <Heading>Thông tin khách hàng</Heading>
        <Field label="Tên khách hàng" value={bill.holder_name} />
        <Field label="Mã khách hàng" value={bill.customer_code} />
        <Field label="Địa chỉ sử dụng" value={bill.address_text} />
        <Heading>Chỉ số</Heading>
        <Table
          columns={['Chỉ số cũ', 'Chỉ số mới', `Tiêu thụ (${bill.unit})`, 'Đơn giá', 'Thành tiền']}
          rows={[[String(previous), String(current), String(used), vnd(bill.unit_price_vnd), vnd(bill.amount_vnd)]]}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', fontWeight: 700, fontSize: 26, marginTop: 24 }}>
          {`Tổng cộng tiền thanh toán: ${vnd(bill.amount_vnd)}`}
        </div>
        <Line>Quý khách vui lòng thanh toán trước ngày 25 của tháng.</Line>
      </div>
    </Page>
  );
}

const leaf = <T,>(value: T) => ({ value, confidence: 1, page: 1 });

/** Bills print the provider in capitals, and the truth is what the page prints. */
const printedProvider = (bill: BillFacts) => bill.provider.toLocaleUpperCase('vi');

export function billTruth(bill: BillFacts): UtilityBillV1 {
  return {
    kind: leaf(bill.kind),
    provider: leaf(printedProvider(bill)),
    customer_code: leaf(bill.customer_code),
    holder_name: leaf(bill.holder_name),
    address_text: leaf(bill.address_text),
    period: leaf(bill.period),
    amount_vnd: leaf(bill.amount_vnd),
    consumption: leaf(bill.readings[1] - bill.readings[0]),
  };
}

export async function renderBill(bill: BillFacts): Promise<ReadonlyMap<string, Uint8Array>> {
  const page = await rasterize(billPage(bill));
  const file =
    bill.variant === 'scan'
      ? (['document.pdf', await scanPdf([page.png])] as const)
      : (['page-1.jpg', degrade(page.raster, 'photo', rngFor(`${FIXTURE_SEED}:${bill.id}`))] as const);
  const truth = { fixture_id: bill.id, variant: bill.variant, files: [file[0]], bill: billTruth(bill) };
  return new Map([file, ['truth.json', new TextEncoder().encode(`${JSON.stringify(truth, null, 2)}\n`)]]);
}

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

async function main(): Promise<void> {
  const manifest: Record<string, Record<string, string>> = {};
  for (const bill of BILLS) {
    const dir = join(BILLS_DIR, bill.id);
    mkdirSync(dir, { recursive: true });
    const files = await renderBill(bill);
    for (const [name, bytes] of files) writeFileSync(join(dir, name), bytes);
    manifest[bill.id] = Object.fromEntries([...files].map(([name, bytes]) => [name, sha256(bytes)]));
  }
  const path = join(BILLS_DIR, 'manifest.json');
  const next = `${JSON.stringify(manifest, null, 2)}\n`;
  const previous = existsSync(path) ? readFileSync(path, 'utf8') : null;
  writeFileSync(path, next);
  console.log(`${BILLS.length} bills, manifest ${previous === next ? 'unchanged' : 'written'}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
