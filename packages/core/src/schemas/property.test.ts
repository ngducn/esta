import { describe, expect, it } from 'vitest';
import { PROPERTY_KINDS, kindDetailsSchema, propertyInputSchema, type PropertyKind } from './property';

const valid: Record<PropertyKind, Record<string, unknown>> = {
  townhouse: {},
  apartment: { building_name: 'Chung cư Demo', block: 'A', floor: -1, unit_no: 'A-12.05', management_fee_vnd: 1_200_000 },
  villa: {},
  rooming_house: { room_count: 8 },
  commercial_space: {},
  warehouse: {},
  residential_land: { frontage_m: 8, road_width_m: 6 },
  agricultural_land: { frontage_m: 25.5 },
  mixed: {},
  other: {},
};

const input = (overrides: Record<string, unknown> = {}) => ({
  nickname: '  Nhà phố Q7 ',
  code: 'Q7',
  kind: 'townhouse',
  kind_details: {},
  use_mode: 'rental',
  legal_status: 'certified',
  current_address: { house_no: '901 Demo', street: 'Đường số 15', commune_code: '27475', province_code: '79' },
  certificate_address_text: 'Dĩ An, Bình Dương',
  acquired_on: '2019-05-20',
  acquisition_kind: 'purchase',
  acquisition_price_vnd: 3_200_000_000,
  notes: '',
  ...overrides,
});

describe('kindDetailsSchema', () => {
  it.each(PROPERTY_KINDS)('accepts the SPEC §5.3 details of %s', (kind) => {
    expect(kindDetailsSchema(kind).safeParse(valid[kind]).success).toBe(true);
  });

  it.each([
    ['townhouse', { room_count: 3 }],
    ['apartment', { frontage_m: 5 }],
    ['residential_land', { unit_no: 'A1' }],
    ['rooming_house', { room_count: 0 }],
    ['rooming_house', { room_count: 2.5 }],
    ['apartment', { management_fee_vnd: -1 }],
    ['apartment', { block: '  ' }],
    ['agricultural_land', { frontage_m: 0 }],
  ] as const)('refuses %s with %o', (kind, details) => {
    expect(kindDetailsSchema(kind).safeParse(details).success).toBe(false);
  });
});

describe('propertyInputSchema', () => {
  it('trims the nickname, turns blank notes into null and keeps the certificate address as typed', () => {
    const parsed = propertyInputSchema.parse(input());
    expect(parsed).toMatchObject({ nickname: 'Nhà phố Q7', notes: null, certificate_address_text: 'Dĩ An, Bình Dương' });
  });

  it.each(PROPERTY_KINDS)('parses a %s with its own details', (kind) => {
    expect(propertyInputSchema.safeParse(input({ kind, kind_details: valid[kind] })).success).toBe(true);
  });

  it('refuses details of another kind under kind_details', () => {
    const parsed = propertyInputSchema.safeParse(input({ kind: 'townhouse', kind_details: { room_count: 3 } }));
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path[0]).toBe('kind_details');
  });

  it.each([1.5, -1, Number.MAX_SAFE_INTEGER + 1, Number.NaN])('refuses an acquisition price of %s, which is not a safe whole number of đồng', (price) => {
    expect(propertyInputSchema.safeParse(input({ acquisition_price_vnd: price })).success).toBe(false);
  });

  it.each([
    ['code', 'q7'],
    ['code', 'TOOLONG99'],
    ['acquired_on', '2026-02-30'],
    ['acquisition_kind', 'lottery'],
    ['nickname', '   '],
  ])('refuses %s %o', (key, value) => {
    expect(propertyInputSchema.safeParse(input({ [key]: value })).success).toBe(false);
  });

  it('takes a property with no current address and no acquisition', () => {
    const parsed = propertyInputSchema.safeParse(
      input({ current_address: null, acquired_on: null, acquisition_kind: null, acquisition_price_vnd: null }),
    );
    expect(parsed.success).toBe(true);
  });
});
