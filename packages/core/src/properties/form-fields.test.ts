import { describe, expect, it } from 'vitest';
import { PROPERTY_KINDS, kindDetailsSchema, type PropertyKind } from '../schemas/property';
import { KIND_FIELDS, kindDetailsText, readKindDetails, type KindFieldTexts } from './form-fields';

const typed: Record<PropertyKind, { texts: KindFieldTexts; details: Record<string, unknown> }> = {
  townhouse: { texts: { room_count: '3' }, details: {} },
  apartment: {
    texts: { building_name: ' Chung cư Demo ', block: 'A', floor: '12', unit_no: 'A-12.05', management_fee_vnd: '1tr2' },
    details: { building_name: 'Chung cư Demo', block: 'A', floor: 12, unit_no: 'A-12.05', management_fee_vnd: 1_200_000 },
  },
  villa: { texts: {}, details: {} },
  rooming_house: { texts: { room_count: '8' }, details: { room_count: 8 } },
  commercial_space: { texts: { frontage_m: '5' }, details: {} },
  warehouse: { texts: {}, details: {} },
  residential_land: { texts: { frontage_m: '8', road_width_m: '6,5' }, details: { frontage_m: 8, road_width_m: 6.5 } },
  agricultural_land: { texts: { frontage_m: '25.5', road_width_m: '4' }, details: { frontage_m: 25.5, road_width_m: 4 } },
  mixed: { texts: { unit_no: 'B2' }, details: {} },
  other: { texts: {}, details: {} },
};

describe('KIND_FIELDS', () => {
  it('gives apartments building, block, floor, unit and fee, rooming houses rooms, and land frontage and road width (PRP-1)', () => {
    expect(KIND_FIELDS.apartment.map((field) => field.key)).toEqual(['building_name', 'block', 'floor', 'unit_no', 'management_fee_vnd']);
    expect(KIND_FIELDS.rooming_house).toEqual([{ key: 'room_count', input: 'integer' }]);
    expect(KIND_FIELDS.residential_land).toEqual(KIND_FIELDS.agricultural_land);
    expect(KIND_FIELDS.agricultural_land.map((field) => field.input)).toEqual(['meters', 'meters']);
    expect(KIND_FIELDS.townhouse).toEqual([]);
  });

  it.each(PROPERTY_KINDS)('reads what was typed for %s into details its schema accepts (PRP-1)', (kind) => {
    const read = readKindDetails(kind, typed[kind].texts);
    expect(read).toEqual({ ok: true, value: typed[kind].details });
    expect(read.ok && kindDetailsSchema(kind).safeParse(read.value).success).toBe(true);
  });

  it.each(PROPERTY_KINDS)('round-trips %s details through the edit text', (kind) => {
    expect(readKindDetails(kind, kindDetailsText(kind, typed[kind].details))).toEqual({ ok: true, value: typed[kind].details });
  });
});

describe('readKindDetails', () => {
  it('names the field it cannot read', () => {
    expect(readKindDetails('apartment', { floor: 'mười hai' })).toEqual({ ok: false, reason: 'floor' });
    expect(readKindDetails('apartment', { management_fee_vnd: '1tr2tr' })).toEqual({ ok: false, reason: 'management_fee_vnd' });
    expect(readKindDetails('residential_land', { road_width_m: '4m' })).toEqual({ ok: false, reason: 'road_width_m' });
  });

  it('skips blank fields', () => {
    expect(readKindDetails('apartment', { building_name: '   ', floor: '' })).toEqual({ ok: true, value: {} });
  });
});

describe('kindDetailsText', () => {
  it('groups the fee and writes metres with a decimal comma', () => {
    expect(kindDetailsText('apartment', { management_fee_vnd: 1_200_000, floor: 3 })).toEqual({ floor: '3', management_fee_vnd: '1.200.000' });
    expect(kindDetailsText('residential_land', { frontage_m: 4.5 })).toEqual({ frontage_m: '4,5' });
  });

  it('ignores keys of other kinds and values of the wrong type', () => {
    expect(kindDetailsText('townhouse', { room_count: 3 })).toEqual({});
    expect(kindDetailsText('rooming_house', { room_count: [3] })).toEqual({});
  });
});
