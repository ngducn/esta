import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ReactElement } from 'react';
import type { LeaseV1 } from '../../../packages/core/src/agent-schemas/lease_v1.ts';
import type { IsoDate } from '../../../packages/core/src/date/iso-date.ts';
import { rngFor } from '../../../supabase/seed/generator/rng.ts';
import { writeFixtures } from './bills.tsx';
import { degrade } from './degrade.ts';
import { FIXTURE_SEED, rasterize, scanPdf } from './generate.ts';
import { date, Field, Heading, Line, NationalHeader, Page, Title, type Palette } from './templates/parts.tsx';

export const LEASES_DIR = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', 'leases');

type Party = { readonly name: string; readonly phone: string; readonly nationalId: string; readonly address: string };

export type LeaseFacts = {
  readonly id: string;
  readonly variant: 'scan' | 'photo';
  readonly title: string;
  readonly signedOn: IsoDate;
  readonly landlord: Party;
  readonly tenant: Party;
  readonly address: string;
  readonly unit: string | null;
  readonly start: IsoDate;
  /** Null when the contract prints only its term. */
  readonly end: IsoDate | null;
  readonly termMonths: number;
  readonly rentVnd: number;
  readonly cycleMonths: 1 | 3 | 6 | 12;
  readonly dueDay: number;
  readonly depositVnd: number;
  readonly notes: string;
};

const LANDLORD: Party = {
  name: 'Nguyễn Thị Demo',
  phone: '0908 111 222',
  nationalId: '079160000123',
  address: 'Số 901 Demo, đường số 15, phường Tân Phong, TP. Hồ Chí Minh',
};

const DI_AN = 'Số 12 đường Demo 7, phường Dĩ An, TP. Dĩ An, tỉnh Bình Dương';

/** Three synthetic leases (AGENT.md §7.2). Every name contains Demo and every ID number is invented. */
export const LEASES: readonly LeaseFacts[] = [
  {
    id: 'lease-di-an-phong-8-photo',
    variant: 'photo',
    title: 'HỢP ĐỒNG THUÊ PHÒNG TRỌ',
    signedOn: '2026-10-05' as IsoDate,
    landlord: LANDLORD,
    tenant: { name: 'Lê Văn Demo', phone: '0903 123 456', nationalId: '074090001234', address: 'Ấp Demo 3, xã Tân Định, tỉnh Bình Dương' },
    address: DI_AN,
    unit: 'Phòng 8',
    start: '2026-10-15' as IsoDate,
    end: '2027-10-14' as IsoDate,
    termMonths: 12,
    rentVnd: 3_500_000,
    cycleMonths: 1,
    dueDay: 5,
    depositVnd: 3_500_000,
    notes: 'Tiền điện 3.500 đ/kWh, tiền nước 100.000 đ/người/tháng, theo chỉ số đồng hồ riêng.',
  },
  {
    id: 'lease-di-an-phong-7-photo',
    variant: 'photo',
    title: 'HỢP ĐỒNG THUÊ PHÒNG TRỌ',
    signedOn: '2026-10-20' as IsoDate,
    landlord: LANDLORD,
    tenant: { name: 'Phạm Minh Demo', phone: '0938 765 432', nationalId: '080095004321', address: 'Số 45 Demo, phường 3, TP. Tân An, tỉnh Long An' },
    address: DI_AN,
    unit: 'Phòng 7',
    start: '2026-11-01' as IsoDate,
    end: '2027-04-30' as IsoDate,
    termMonths: 6,
    rentVnd: 3_200_000,
    cycleMonths: 1,
    dueDay: 10,
    depositVnd: 6_400_000,
    notes: 'Tiền điện 3.500 đ/kWh, tiền nước 25.000 đ/m³. Phí rác 20.000 đ/tháng.',
  },
  {
    id: 'lease-thu-duc-scan',
    variant: 'scan',
    title: 'HỢP ĐỒNG THUÊ CĂN HỘ',
    signedOn: '2026-09-25' as IsoDate,
    landlord: LANDLORD,
    tenant: { name: 'Trần Thị Demo', phone: '0912 345 678', nationalId: '001190005678', address: 'Số 8 Demo, phường Bến Nghé, TP. Hồ Chí Minh' },
    address: 'Căn hộ A-12.05, chung cư Demo Riverside, phường Linh Đông, TP. Thủ Đức, TP. Hồ Chí Minh',
    unit: null,
    start: '2026-10-01' as IsoDate,
    end: null,
    termMonths: 12,
    rentVnd: 12_500_000,
    cycleMonths: 3,
    dueDay: 1,
    depositVnd: 25_000_000,
    notes: 'Phí quản lý do Bên B trả trực tiếp cho ban quản lý. Giá thuê tăng 5% mỗi năm.',
  },
];

const vnd = (amount: number) => `${String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} đồng`;
const grouped = (id: string) => `${id.slice(0, 3)} ${id.slice(3, 6)} ${id.slice(6, 9)} ${id.slice(9)}`;
const CYCLE_WORDS = { 1: 'hàng tháng', 3: 'mỗi quý (3 tháng một lần)', 6: '6 tháng một lần', 12: 'mỗi năm một lần' } as const;

const palette: Palette = { paper: '#fffdf7', frame: '#fffdf7', ink: '#1a1a1a' };

function PartyBlock({ heading, party }: { readonly heading: string; readonly party: Party }): ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <Heading>{heading}</Heading>
      <Field label="Ông/Bà" value={party.name} />
      <Field label="Điện thoại" value={party.phone} />
      <Field label="Số CCCD" value={grouped(party.nationalId)} />
      <Field label="Địa chỉ thường trú" value={party.address} />
    </div>
  );
}

function leasePage(lease: LeaseFacts): ReactElement {
  const place = lease.unit === null ? lease.address : `${lease.unit}, ${lease.address}`;
  const term = lease.end === null ? `${lease.termMonths} tháng, kể từ ngày ${date(lease.start)}` : `từ ngày ${date(lease.start)} đến ngày ${date(lease.end)}`;
  return (
    <Page palette={palette}>
      <div style={{ display: 'flex', flexDirection: 'column', fontSize: 19 }}>
        <NationalHeader />
        <Title color="#1a1a1a">{lease.title}</Title>
        <Line>{`Hôm nay, ngày ${date(lease.signedOn)}, chúng tôi gồm:`}</Line>
        <PartyBlock heading="BÊN CHO THUÊ (Bên A)" party={lease.landlord} />
        <PartyBlock heading="BÊN THUÊ (Bên B)" party={lease.tenant} />
        <Heading>Điều 1. Nơi cho thuê</Heading>
        <Line>{`Bên A đồng ý cho Bên B thuê: ${place}.`}</Line>
        <Heading>Điều 2. Thời hạn thuê</Heading>
        <Line>{`Thời hạn thuê ${term}.`}</Line>
        <Heading>Điều 3. Giá thuê và thanh toán</Heading>
        <Line>{`Giá thuê: ${vnd(lease.rentVnd)}/tháng.`}</Line>
        <Line>{`Bên B trả tiền thuê ${CYCLE_WORDS[lease.cycleMonths]}, chậm nhất ngày ${lease.dueDay} của kỳ thanh toán.`}</Line>
        <Heading>Điều 4. Tiền đặt cọc</Heading>
        <Line>{`Bên B đặt cọc ${vnd(lease.depositVnd)}, Bên A hoàn lại khi hết hạn hợp đồng.`}</Line>
        <Heading>Điều 5. Các khoản khác</Heading>
        <Line>{lease.notes}</Line>
        <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 36, fontWeight: 700 }}>
          <div style={{ display: 'flex' }}>BÊN CHO THUÊ</div>
          <div style={{ display: 'flex' }}>BÊN THUÊ</div>
        </div>
      </div>
    </Page>
  );
}

const leaf = <T,>(value: T) => ({ value, confidence: 1, page: 1 });

export function leaseTruth(lease: LeaseFacts): LeaseV1 {
  return {
    tenant_name: leaf(lease.tenant.name),
    tenant_phone: leaf(lease.tenant.phone),
    tenant_id_last4: leaf(lease.tenant.nationalId.slice(-4)),
    property_address: leaf(lease.address),
    unit_label: leaf(lease.unit),
    start_date: leaf(lease.start),
    end_date: leaf(lease.end),
    term_months: leaf(lease.termMonths),
    rent_vnd: leaf(lease.rentVnd),
    billing_cycle_months: leaf(lease.cycleMonths),
    due_day: leaf(lease.dueDay),
    deposit_vnd: leaf(lease.depositVnd),
    notes: leaf(lease.notes),
  };
}

export async function renderLease(lease: LeaseFacts): Promise<ReadonlyMap<string, Uint8Array>> {
  const page = await rasterize(leasePage(lease));
  const file =
    lease.variant === 'scan'
      ? (['document.pdf', await scanPdf([page.png])] as const)
      : (['page-1.jpg', degrade(page.raster, 'photo', rngFor(`${FIXTURE_SEED}:${lease.id}`))] as const);
  const truth = {
    fixture_id: lease.id,
    variant: lease.variant,
    files: [file[0]],
    lease: leaseTruth(lease),
    printed_id_numbers: [lease.landlord.nationalId, lease.tenant.nationalId],
  };
  return new Map([file, ['truth.json', new TextEncoder().encode(`${JSON.stringify(truth, null, 2)}\n`)]]);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(await writeFixtures(LEASES_DIR, LEASES, renderLease));
