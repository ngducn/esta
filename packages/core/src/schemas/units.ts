import { z } from 'zod';
import type { IsoDate } from '../date/iso-date';
import type { Vnd } from '../money/vnd';
import { areaSchema, isoDateSchema, optionalText, text } from './legal';
import { vndSchema } from './property';

/** SPEC §5.3. `whole` is the one unit of an undivided property; the database creates and removes it. */
export const UNIT_KINDS = ['whole', 'room', 'floor', 'shop', 'lot'] as const;
export type UnitKind = (typeof UNIT_KINDS)[number];

export const UTILITY_KINDS = ['electricity', 'water', 'internet', 'other'] as const;
export type UtilityKind = (typeof UTILITY_KINDS)[number];

/** `[app rule]` A ceiling far above any real monthly rent, so a property's summed rent stays a safe integer. */
export const MAX_LIST_RENT_VND = 1_000_000_000_000;
const listRentSchema = vndSchema.refine((amount) => amount <= MAX_LIST_RENT_VND);

export const unitSchema = z.strictObject({
  label: text(80),
  kind: z.enum(UNIT_KINDS),
  area_m2: areaSchema.nullable(),
  list_rent_vnd: listRentSchema.nullable(),
  available_from: isoDateSchema.nullable(),
});
export type UnitValue = z.output<typeof unitSchema>;

export type Unit = {
  readonly id: string;
  readonly label: string;
  readonly kind: UnitKind;
  readonly area_m2: number | null;
  readonly list_rent_vnd: Vnd | null;
  readonly available_from: IsoDate | null;
  readonly sort_order: number;
};

export const utilityAccountSchema = z.strictObject({
  unit_id: z.uuid().nullable(),
  kind: z.enum(UTILITY_KINDS),
  provider: optionalText(120),
  customer_code: optionalText(40),
  holder_name: optionalText(200),
  note: optionalText(1000),
});
export type UtilityAccountValue = z.output<typeof utilityAccountSchema>;
export type UtilityAccount = UtilityAccountValue & { readonly id: string };

/** A batch of new rooms: the labels `nextRoomLabels` computed when the sheet opened, and one list rent for all. */
export const addRoomsSchema = z.strictObject({
  labels: z.array(text(80)).min(1).max(50).refine((labels) => new Set(labels).size === labels.length),
  list_rent_vnd: listRentSchema.nullable(),
});
