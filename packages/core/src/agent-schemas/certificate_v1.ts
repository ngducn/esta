import { z } from 'zod';
import { isIsoDate } from '../date/iso-date';
import { parseMeasureInput } from '../parse/measure';

export const CERTIFICATE_FORMS = ['so_do_pre2009', 'so_hong_pre2009', 'gcn_2009_2024', 'gcn_2024', 'paper_only'] as const;

export type CertificateForm = (typeof CERTIFICATE_FORMS)[number];

export const ANNOTATION_KINDS = ['mortgage', 'mortgage_release', 'transfer', 'change_of_area', 'other'] as const;

export type AnnotationKind = (typeof ANNOTATION_KINDS)[number];

const confidence = z.number().min(0).max(1);
const page = z.number().int().min(1).max(999).nullable();

/** Every leaf carries the model's confidence and the page it read the value from, null when the value is absent (DOMAIN-VN §2.1). */
export function leaf<T extends z.ZodType>(value: T) {
  return z.object({ value: value.nullable(), confidence, page });
}

/**
 * Reads printed text as every screen reads an area, so `125,5 m²` is 125.5. Text with more decimals than an area
 * keeps, such as `1,255 m²`, stays as printed for Mẹ to settle on review; other text goes back to the model.
 */
function readPrintedArea(raw: unknown, context: z.RefinementCtx): unknown {
  if (typeof raw !== 'string') return raw;
  const area = parseMeasureInput(raw, 'area');
  if (area.ok) return area.value;
  if (area.reason === 'too_precise') return raw;
  context.addIssue({ code: 'custom', message: `expected an area in square metres, such as 125.5 (${area.reason})` });
  return z.NEVER;
}

/** Bounded, as every number in a result is, so a national ID cannot pass as one (SPEC D11). */
const area = z.preprocess(readPrintedArea, z.union([z.number().nonnegative().max(100_000_000), z.string()]));

const text = leaf(z.string());
const isoDate = leaf(z.string().refine(isIsoDate, 'expected YYYY-MM-DD'));

export const holderSchema = z.object({
  full_name: text,
  birth_year: leaf(z.number().int().min(1900).max(2100)),
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
  floors: leaf(z.number().int().min(0).max(200)),
  structure_text: text,
  completed_year: leaf(z.number().int().min(1800).max(2100)),
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
