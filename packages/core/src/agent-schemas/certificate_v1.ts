import { z } from 'zod';
import { isIsoDate } from '../date/iso-date';
import { parseDecimal } from '../parse/decimal';

export const CERTIFICATE_FORMS = ['so_do_pre2009', 'so_hong_pre2009', 'gcn_2009_2024', 'gcn_2024', 'paper_only'] as const;

export type CertificateForm = (typeof CERTIFICATE_FORMS)[number];

export const ANNOTATION_KINDS = ['mortgage', 'mortgage_release', 'transfer', 'change_of_area', 'other'] as const;

export type AnnotationKind = (typeof ANNOTATION_KINDS)[number];

const confidence = z.number().min(0).max(1);
const page = z.number().int().min(1).nullable();

/** Every leaf carries the model's confidence and the page it read the value from, null when the value is absent (DOMAIN-VN §2.1). */
export function leaf<T extends z.ZodType>(value: T) {
  return z.object({ value: value.nullable(), confidence, page });
}

const AREA_UNIT = /\s*m(?:²|2)\s*$/u;

/** Reads an area printed the Vietnamese way, so `125,5 m²` is 125.5 and `1.250,5` is 1250.5. */
export function parseArea(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  const decimal = parseDecimal(raw.trim().replace(AREA_UNIT, ''));
  return decimal === null ? raw : Number(decimal.digits) / 10 ** decimal.scale;
}

const area = z.preprocess(parseArea, z.number().nonnegative());

const text = leaf(z.string());
const isoDate = leaf(z.string().refine(isIsoDate, 'expected YYYY-MM-DD'));

export const holderSchema = z.object({
  full_name: text,
  birth_year: leaf(z.number().int()),
  id_last4: leaf(z.string().regex(/^\d{4}$/, 'exactly four digits')),
  address_text: text,
  relation: text,
});

export const purposeSchema = z.object({
  land_use_code: text,
  area_m2: leaf(area),
  term: text,
});

export const parcelSchema = z.object({
  parcel_no: text,
  map_sheet_no: text,
  address_text: text,
  area_m2: leaf(area),
  use_form: text,
  purposes: z.array(purposeSchema),
  origin_text: text,
});

export const structureSchema = z.object({
  kind: text,
  footprint_m2: leaf(area),
  floor_area_m2: leaf(area),
  floors: leaf(z.number().int()),
  structure_text: text,
  completed_year: leaf(z.number().int()),
  ownership_term: text,
});

export const annotationSchema = z.object({
  date: isoDate,
  text,
  kind: leaf(z.enum(ANNOTATION_KINDS)),
});

export const certificateV1Schema = z.object({
  form: leaf(z.enum(CERTIFICATE_FORMS)),
  holders: z.array(holderSchema),
  parcels: z.array(parcelSchema),
  structures: z.array(structureSchema),
  serial_no: text,
  book_entry_no: text,
  issued_on: isoDate,
  issued_by: text,
  annotations: z.array(annotationSchema),
  has_qr: leaf(z.boolean()),
  notes_text: text,
});

export type CertificateV1 = z.infer<typeof certificateV1Schema>;
export type CertificateV1Input = z.input<typeof certificateV1Schema>;
