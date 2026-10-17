import { z } from 'zod';
import { isIsoDate, type IsoDate } from '../date/iso-date';
import { vnd, type Vnd } from '../money/vnd';
import {
  ACQUISITION_KINDS,
  KIND_DETAIL_KEYS,
  LEGAL_STATUSES,
  PROPERTY_KINDS,
  USE_MODES,
  type AcquisitionKind,
  type KindDetailKey,
  type LegalStatus,
  type PropertyKind,
  type UseMode,
} from '../properties/kinds';

export {
  ACQUISITION_KINDS,
  KIND_DETAIL_KEYS,
  LEGAL_STATUSES,
  PROPERTY_KINDS,
  USE_MODES,
  type AcquisitionKind,
  type KindDetailKey,
  type LegalStatus,
  type PropertyKind,
  type UseMode,
};

export const vndSchema = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER)
  .transform((n) => vnd(n));

const detailText = z.string().trim().min(1).max(120);
const whole = (min: number, max: number) => z.number().int().min(min).max(max);
const metres = z.number().positive().lt(10_000);

/** One schema per `kind_details` key, matching `private.valid_kind_details` value for value. */
const DETAIL_SCHEMAS = {
  building_name: detailText,
  block: detailText,
  floor: whole(-10, 200),
  unit_no: detailText,
  management_fee_vnd: vndSchema,
  room_count: whole(1, 1000),
  frontage_m: metres,
  road_width_m: metres,
} as const satisfies Record<KindDetailKey, z.ZodType>;

type DetailValues = { [K in KindDetailKey]: z.output<(typeof DETAIL_SCHEMAS)[K]> };

export type DetailsOf<K extends PropertyKind> = Partial<Pick<DetailValues, (typeof KIND_DETAIL_KEYS)[K][number]>>;

export type KindDetails = { [K in PropertyKind]: { readonly kind: K; readonly kind_details: DetailsOf<K> } }[PropertyKind];

export function kindDetailsSchema<K extends PropertyKind>(kind: K): z.ZodType<DetailsOf<K>> {
  const keys: readonly KindDetailKey[] = KIND_DETAIL_KEYS[kind];
  return z.strictObject(Object.fromEntries(keys.map((key) => [key, DETAIL_SCHEMAS[key].optional()]))) as unknown as z.ZodType<DetailsOf<K>>;
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((text) => (text === null || text === '' ? null : text.normalize('NFC')));

export const currentAddressInputSchema = z.object({
  house_no: optionalText(60),
  street: optionalText(160),
  commune_code: z.string().regex(/^[0-9]{5}$/),
  province_code: z.string().regex(/^[0-9]{2}$/),
});

export type CurrentAddressInput = z.output<typeof currentAddressInputSchema>;

const baseSchema = z.object({
  nickname: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .transform((text) => text.normalize('NFC')),
  code: z.string().regex(/^[A-Z0-9]{1,8}$/),
  kind: z.enum(PROPERTY_KINDS),
  kind_details: z.record(z.string(), z.unknown()),
  use_mode: z.enum(USE_MODES),
  legal_status: z.enum(LEGAL_STATUSES),
  current_address: currentAddressInputSchema.nullable(),
  certificate_address_text: optionalText(500),
  acquired_on: z
    .string()
    .refine(isIsoDate)
    .transform((text) => text as IsoDate)
    .nullable(),
  acquisition_kind: z.enum(ACQUISITION_KINDS).nullable(),
  acquisition_price_vnd: vndSchema.nullable(),
  notes: optionalText(4000),
});

type BaseInput = Omit<z.output<typeof baseSchema>, 'kind' | 'kind_details' | 'acquisition_price_vnd'> & {
  readonly acquisition_price_vnd: Vnd | null;
};

/** What a create or edit sends: the row's own columns, with `kind_details` holding only its kind's keys. */
export type PropertyInput = BaseInput & KindDetails;

export const propertyInputSchema: z.ZodType<PropertyInput, unknown> = baseSchema.transform((input, ctx) => {
  const details = kindDetailsSchema(input.kind).safeParse(input.kind_details);
  if (!details.success) {
    for (const issue of details.error.issues) ctx.addIssue({ code: 'custom', path: ['kind_details', ...issue.path], message: issue.message });
    return z.NEVER;
  }
  return { ...input, kind_details: details.data } as PropertyInput;
});
