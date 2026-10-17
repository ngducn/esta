import { parseDecimal } from '../parse/decimal';
import { parseVndInput } from '../parse/vnd-input';
import type { Result } from '../result';
import { KIND_DETAIL_KEYS, type DetailsOf, type KindDetailKey, type PropertyKind } from '../schemas/property';

/** How a detail is typed: `vnd` reads shorthand such as `1tr2`, `meters` takes a decimal comma or point. */
export type KindFieldInput = 'text' | 'integer' | 'meters' | 'vnd';

export type KindField = { readonly key: KindDetailKey; readonly input: KindFieldInput };

const INPUTS: Record<KindDetailKey, KindFieldInput> = {
  building_name: 'text',
  block: 'text',
  floor: 'integer',
  unit_no: 'text',
  management_fee_vnd: 'vnd',
  room_count: 'integer',
  frontage_m: 'meters',
  road_width_m: 'meters',
};

const fields = (keys: readonly KindDetailKey[]): readonly KindField[] => keys.map((key) => ({ key, input: INPUTS[key] }));

/** The fields the form renders for each kind, in order. Apartments get building and unit, rooming houses rooms, land frontage. */
export const KIND_FIELDS: { readonly [K in PropertyKind]: readonly KindField[] } = {
  townhouse: fields(KIND_DETAIL_KEYS.townhouse),
  apartment: fields(KIND_DETAIL_KEYS.apartment),
  villa: fields(KIND_DETAIL_KEYS.villa),
  rooming_house: fields(KIND_DETAIL_KEYS.rooming_house),
  commercial_space: fields(KIND_DETAIL_KEYS.commercial_space),
  warehouse: fields(KIND_DETAIL_KEYS.warehouse),
  residential_land: fields(KIND_DETAIL_KEYS.residential_land),
  agricultural_land: fields(KIND_DETAIL_KEYS.agricultural_land),
  mixed: fields(KIND_DETAIL_KEYS.mixed),
  other: fields(KIND_DETAIL_KEYS.other),
};

export type KindFieldTexts = Partial<Record<KindDetailKey, string>>;

const INTEGER = /^-?[0-9]{1,6}$/;

function readValue(input: KindFieldInput, text: string): string | number | null {
  switch (input) {
    case 'text':
      return text.normalize('NFC');
    case 'integer':
      return INTEGER.test(text) ? Number(text) : null;
    case 'meters': {
      const decimal = parseDecimal(text);
      return decimal === null ? null : Number(decimal.digits) / 10 ** decimal.scale;
    }
    case 'vnd': {
      const amount = parseVndInput(text);
      return amount.ok ? amount.value : null;
    }
  }
}

/**
 * Reads what was typed into the kind's fields, skipping blank ones; keys of other kinds are dropped, so switching the
 * kind in the form never sends a stale detail. Range checks stay with `kindDetailsSchema`, which the action applies.
 */
export function readKindDetails<K extends PropertyKind>(kind: K, texts: KindFieldTexts): Result<DetailsOf<K>, KindDetailKey> {
  const details: Partial<Record<KindDetailKey, string | number>> = {};
  for (const { key, input } of KIND_FIELDS[kind]) {
    const text = (texts[key] ?? '').trim().replace(/\s+/g, ' ');
    if (text === '') continue;
    const value = readValue(input, text);
    if (value === null) return { ok: false, reason: key };
    details[key] = value;
  }
  return { ok: true, value: details as DetailsOf<K> };
}

const grouped = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/** The text each field starts with on the edit page, as Mẹ would type it back: `1.200.000`, `4,5`. */
export function kindDetailsText(kind: PropertyKind, details: Readonly<Record<string, unknown>>): KindFieldTexts {
  const texts: KindFieldTexts = {};
  for (const { key, input } of KIND_FIELDS[kind]) {
    const value = details[key];
    if (typeof value === 'string') texts[key] = value;
    else if (typeof value === 'number') texts[key] = input === 'vnd' ? grouped(value) : input === 'meters' ? String(value).replace('.', ',') : String(value);
  }
  return texts;
}
