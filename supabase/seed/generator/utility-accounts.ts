import { publicTable } from './context.ts';
import { householdId } from './households.ts';
import { seedId } from './ids.ts';
import type { PropertySeedKey } from './properties.ts';
import { propertyId } from './units.ts';

type AccountSeed = { kind: 'electricity' | 'water'; provider: string; customer_code: string };

/** One electricity and one water account at property level. Mặt bằng Quận 1 has none, because its tenant holds them. */
const ACCOUNT_SEEDS: Partial<Record<PropertySeedKey, readonly AccountSeed[]>> = {
  q7: [
    { kind: 'electricity', provider: 'Điện lực Demo Tân Thuận', customer_code: 'PE0901000001' },
    { kind: 'water', provider: 'Cấp nước Demo Nhà Bè', customer_code: 'NB0901000001' },
  ],
  'thu-duc': [
    { kind: 'electricity', provider: 'Điện lực Demo Thủ Đức', customer_code: 'PE0902000002' },
    { kind: 'water', provider: 'Cấp nước Demo Thủ Đức', customer_code: 'TD0902000002' },
  ],
  'di-an': [
    { kind: 'electricity', provider: 'Điện lực Demo Dĩ An', customer_code: 'PB0903000003' },
    { kind: 'water', provider: 'Cấp nước Demo Dĩ An', customer_code: 'DA0903000003' },
  ],
  'bien-hoa': [
    { kind: 'electricity', provider: 'Điện lực Demo Biên Hòa', customer_code: 'PK0905000005' },
    { kind: 'water', provider: 'Cấp nước Demo Đồng Nai', customer_code: 'DN0905000005' },
  ],
};

export const utilityAccounts = publicTable('utility_accounts', ({ household, properties }) =>
  properties.flatMap(({ key }) =>
    (ACCOUNT_SEEDS[key] ?? []).map((seed) => ({
      id: seedId(`seed:utility-account:${household.key}:${key}:${seed.kind}`),
      household_id: householdId(household),
      property_id: propertyId(household, key),
      unit_id: null,
      kind: seed.kind,
      provider: seed.provider,
      customer_code: seed.customer_code,
      holder_name: null,
      note: null,
    })),
  ),
);
