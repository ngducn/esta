import { publicTable } from './context.ts';
import { householdId } from './households.ts';
import { seedId } from './ids.ts';
import type { PropertySeedKey } from './properties.ts';
import { propertyId } from './units.ts';

type ValuationSeed = {
  readonly asOf: string;
  readonly valueVnd: number;
  readonly method: 'owner_estimate' | 'broker_quote' | 'state_price_reference' | 'comparables';
  readonly sourceUrl: string | null;
  readonly note: string | null;
};

export const VALUATION_SEEDS: Readonly<Record<PropertySeedKey, ValuationSeed>> = {
  q7: { asOf: '2026-06-15', valueVnd: 14_500_000_000, method: 'broker_quote', sourceUrl: 'https://example.com/demo/bao-gia-nha-pho-q7', note: 'Môi giới Demo báo giá qua Zalo' },
  'thu-duc': { asOf: '2026-05-20', valueVnd: 4_200_000_000, method: 'comparables', sourceUrl: null, note: 'Hai căn cùng tầng bán trong quý 2' },
  'di-an': { asOf: '2026-03-10', valueVnd: 6_800_000_000, method: 'owner_estimate', sourceUrl: null, note: null },
  q1: { asOf: '2026-07-01', valueVnd: 7_200_000_000, method: 'broker_quote', sourceUrl: null, note: null },
  'bien-hoa': { asOf: '2026-02-01', valueVnd: 7_500_000_000, method: 'state_price_reference', sourceUrl: null, note: null },
  'long-an': { asOf: '2025-11-15', valueVnd: 1_850_000_000, method: 'owner_estimate', sourceUrl: null, note: null },
  'bao-loc': { asOf: '2026-04-20', valueVnd: 3_200_000_000, method: 'state_price_reference', sourceUrl: null, note: 'Theo bảng giá đất Lâm Đồng' },
};

export const valuations = publicTable('valuations', ({ household, properties }) =>
  properties.map(({ key }) => {
    const seed = VALUATION_SEEDS[key];
    return {
      id: seedId(`seed:valuation:${household.key}:${key}`),
      household_id: householdId(household),
      property_id: propertyId(household, key),
      as_of: seed.asOf,
      value_vnd: seed.valueVnd,
      method: seed.method,
      source_url: seed.sourceUrl,
      note: seed.note,
    };
  }),
);
