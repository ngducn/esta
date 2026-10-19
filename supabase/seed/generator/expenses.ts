import { publicTable, type HouseholdSeed } from './context.ts';
import { householdId } from './households.ts';
import { seedId } from './ids.ts';
import type { PropertySeedKey } from './properties.ts';
import { propertyId } from './units.ts';

type VendorSeed = { readonly key: string; readonly kind: 'individual' | 'organization'; readonly fullName: string; readonly tags: readonly string[] };

const VENDOR_SEEDS = [
  { key: 'tho-sua', kind: 'individual', fullName: 'Thợ sửa nhà Demo', tags: ['contractor'] },
  { key: 'tho-dien-nuoc', kind: 'individual', fullName: 'Thợ điện nước Demo', tags: ['contractor'] },
  { key: 'ban-quan-ly', kind: 'organization', fullName: 'Ban quản lý Chung cư Demo Bình Thọ', tags: ['other'] },
  { key: 'moi-gioi', kind: 'individual', fullName: 'Môi giới Demo Quận 1', tags: ['broker'] },
] as const satisfies readonly VendorSeed[];

type VendorKey = (typeof VENDOR_SEEDS)[number]['key'];

const vendorId = (household: HouseholdSeed, key: VendorKey) => seedId(`seed:party:vendor-${household.key}:${key}`);

export const vendors = publicTable('parties', ({ household }) =>
  VENDOR_SEEDS.map((vendor) => ({
    id: vendorId(household, vendor.key),
    household_id: householdId(household),
    kind: vendor.kind,
    full_name: vendor.fullName,
    tags: [...vendor.tags],
    member_id: null,
  })),
);

type ExpenseSeed = {
  readonly property: PropertySeedKey;
  readonly category: 'repair' | 'maintenance' | 'utility' | 'management_fee' | 'land_tax' | 'insurance' | 'broker_fee' | 'legal';
  readonly amountVnd: number;
  readonly paidOn: string;
  readonly vendor: VendorKey | null;
  readonly note: string | null;
};

const managementFees: ExpenseSeed[] = ['2025-10', '2025-11', '2025-12', ...Array.from({ length: 9 }, (_, i) => `2026-0${i + 1}`)].map((month) => ({
  property: 'thu-duc',
  category: 'management_fee',
  amountVnd: 1_200_000,
  paidOn: `${month}-05`,
  vendor: 'ban-quan-ly',
  note: null,
}));

/**
 * SPEC §9.3: twelve months of expenses, from October 2025 to September 2026, the same in every household. Nhà phố Q7's
 * repairs in 2026 total 8.650.000 VND (supabase/seed/README.md, AGENT.md §7.4 question 7). `long-an` has none, so its
 * Thu chi tab shows the empty year.
 */
export const EXPENSE_SEEDS: readonly ExpenseSeed[] = [
  { property: 'q7', category: 'insurance', amountVnd: 2_400_000, paidOn: '2025-10-30', vendor: null, note: 'Bảo hiểm cháy nổ một năm' },
  { property: 'q7', category: 'repair', amountVnd: 1_800_000, paidOn: '2025-11-12', vendor: 'tho-dien-nuoc', note: 'Sửa ống nước nhà vệ sinh tầng 2' },
  { property: 'q7', category: 'repair', amountVnd: 3_200_000, paidOn: '2026-02-20', vendor: 'tho-sua', note: 'Sơn lại cổng và hàng rào' },
  { property: 'q7', category: 'maintenance', amountVnd: 1_200_000, paidOn: '2026-03-08', vendor: 'tho-dien-nuoc', note: 'Vệ sinh bồn nước' },
  { property: 'q7', category: 'repair', amountVnd: 950_000, paidOn: '2026-05-14', vendor: 'tho-dien-nuoc', note: 'Thay đèn cầu thang' },
  { property: 'q7', category: 'repair', amountVnd: 4_500_000, paidOn: '2026-08-22', vendor: 'tho-sua', note: 'Chống thấm sân thượng' },
  ...managementFees,
  { property: 'di-an', category: 'repair', amountVnd: 650_000, paidOn: '2026-01-09', vendor: 'tho-sua', note: 'Sửa khoá cửa Phòng 3' },
  { property: 'di-an', category: 'repair', amountVnd: 1_500_000, paidOn: '2026-06-17', vendor: 'tho-dien-nuoc', note: 'Thay máy bơm nước' },
  { property: 'di-an', category: 'maintenance', amountVnd: 800_000, paidOn: '2026-09-11', vendor: 'tho-dien-nuoc', note: 'Thông cống chung' },
  { property: 'q1', category: 'broker_fee', amountVnd: 15_000_000, paidOn: '2026-02-25', vendor: 'moi-gioi', note: 'Nửa tháng tiền thuê cho môi giới' },
  { property: 'q1', category: 'legal', amountVnd: 1_100_000, paidOn: '2026-02-27', vendor: null, note: 'Công chứng hợp đồng thuê' },
  { property: 'bien-hoa', category: 'maintenance', amountVnd: 2_000_000, paidOn: '2026-08-03', vendor: 'tho-sua', note: 'Dọn kho sau khi hết hợp đồng' },
  { property: 'bao-loc', category: 'land_tax', amountVnd: 450_000, paidOn: '2026-04-15', vendor: null, note: 'Thuế sử dụng đất phi nông nghiệp năm 2026' },
];

export const expenses = publicTable('expenses', ({ household, properties }) => {
  const present = new Set(properties.map(({ key }) => key));
  const counts = new Map<string, number>();
  return EXPENSE_SEEDS.filter((seed) => present.has(seed.property)).map((seed) => {
    const month = `${seed.property}:${seed.paidOn.slice(0, 7)}`;
    const n = (counts.get(month) ?? 0) + 1;
    counts.set(month, n);
    return {
      id: seedId(`seed:expense:${household.key}:${month}:${n}`),
      household_id: householdId(household),
      property_id: propertyId(household, seed.property),
      category: seed.category,
      amount_vnd: seed.amountVnd,
      paid_on: seed.paidOn,
      vendor_party_id: seed.vendor === null ? null : vendorId(household, seed.vendor),
      document_id: null,
      note: seed.note,
    };
  });
});
