import { z } from 'zod';
import { isIsoDate } from '../date/iso-date';

export const CERTIFICATE_FORMS = ['so_do_pre2009', 'so_hong_pre2009', 'gcn_2009_2024', 'gcn_2024', 'paper_only'] as const;

export type CertificateForm = (typeof CERTIFICATE_FORMS)[number];

export const ANNOTATION_KINDS = ['mortgage', 'mortgage_release', 'transfer', 'change_of_area', 'other'] as const;

const confidence = z.number().min(0).max(1);
const page = z.number().int().min(1);

/** Every leaf carries the model's confidence and the page it read the value from (DOMAIN-VN §2.1). */
function leaf<T extends z.ZodType>(value: T) {
  return z.object({ value: value.nullable(), confidence, page });
}

const DECIMAL_COMMA = /^\s*(\d+)(?:,(\d+))?\s*$/;

/** Areas arrive as numbers; a `125,5` string is the Vietnamese decimal comma and reads as 125.5. */
const area = z.preprocess((raw) => {
  if (typeof raw !== 'string') return raw;
  const match = DECIMAL_COMMA.exec(raw);
  return match === null ? raw : Number(match[2] === undefined ? match[1] : `${match[1]}.${match[2]}`);
}, z.number().nonnegative());

const text = leaf(z.string());
const number = leaf(z.number());
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

export { number as certificateNumberLeaf };
