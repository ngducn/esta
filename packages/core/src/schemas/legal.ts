import { z } from 'zod';
import { isIsoDate, type IsoDate } from '../date/iso-date';
import { identifies, UNIDENTIFIED } from './identity';
import { vndSchema } from './property';

/** DOMAIN-VN §2, in era order. */
export const CERTIFICATE_FORMS = ['so_do_pre2009', 'so_hong_pre2009', 'gcn_2009_2024', 'gcn_2024', 'paper_only'] as const;
export type CertificateForm = (typeof CERTIFICATE_FORMS)[number];

export const CERTIFICATE_STATUSES = ['valid', 'mortgaged', 'replaced', 'lost'] as const;
export type CertificateStatus = (typeof CERTIFICATE_STATUSES)[number];

export const ANNOTATION_KINDS = ['mortgage', 'mortgage_release', 'transfer', 'change_of_area', 'other'] as const;
export const USE_FORMS = ['private', 'shared'] as const;
export const LONG_TERM = 'long_term';

export const isoDateSchema = z
  .string()
  .refine(isIsoDate)
  .transform((text) => text as IsoDate);

/** Square meters in hundredths, the scale of numeric(12,2). */
export const areaSchema = z
  .number()
  .positive()
  .lt(10_000_000_000)
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6);

export const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .transform((value) => value.normalize('NFC'));

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => (value === null || value === '' ? null : value.normalize('NFC')));

/** Any non-empty code parses, so a code missing from `land_use_codes` is kept as typed (DOMAIN-VN §3). */
export const purposeSchema = z.strictObject({
  land_use_code: text(20).transform((code) => code.toUpperCase()),
  area_m2: areaSchema.optional(),
  term: z.union([z.literal(LONG_TERM), isoDateSchema]).optional(),
});
export type Purpose = z.output<typeof purposeSchema>;

export const parcelSchema = z.strictObject({
  certificate_id: z.uuid().nullable(),
  parcel_no: optionalText(20),
  map_sheet_no: optionalText(20),
  area_m2: areaSchema.nullable(),
  use_form: z.enum(USE_FORMS).nullable(),
  purposes: z.array(purposeSchema).max(20),
  origin_text: optionalText(500),
});

export const newParcelSchema = parcelSchema.refine(identifies('parcel'), { error: UNIDENTIFIED });
export type Parcel = z.output<typeof parcelSchema>;

export const structureSchema = z.strictObject({
  certificate_id: z.uuid().nullable(),
  kind: text(120),
  footprint_m2: areaSchema.nullable(),
  floor_area_m2: areaSchema.nullable(),
  floors: z.number().int().min(1).max(200).nullable(),
  structure_text: optionalText(500),
  completed_year: z.number().int().min(1800).max(2200).nullable(),
  ownership_term: optionalText(120),
});
export type Structure = z.output<typeof structureSchema>;

export const annotationSchema = z.strictObject({
  date: isoDateSchema.optional(),
  text: text(2000),
  kind: z.enum(ANNOTATION_KINDS).optional(),
});
export type Annotation = z.output<typeof annotationSchema>;

const mortgageShape = z.strictObject({
  bank_party_id: z.uuid(),
  amount_vnd: vndSchema,
  registered_on: isoDateSchema.optional(),
  released_on: isoDateSchema.optional(),
});

export const mortgageSchema = mortgageShape.refine(
  (mortgage) => mortgage.registered_on === undefined || mortgage.released_on === undefined || mortgage.registered_on <= mortgage.released_on,
  { path: ['released_on'] },
);
export type Mortgage = z.output<typeof mortgageSchema>;

const certificateBase = z.object({
  form: z.enum(CERTIFICATE_FORMS),
  serial_no: optionalText(40),
  book_entry_no: optionalText(40),
  issued_on: isoDateSchema.nullable(),
  issued_by: optionalText(300),
  holder_party_ids: z
    .array(z.uuid())
    .max(20)
    .refine((ids) => new Set(ids).size === ids.length),
  annotations: z.array(annotationSchema).max(50),
});

/**
 * `mortgaged` exactly when an open mortgage is present, as `certificates_mortgaged_status` holds in SQL. Any other
 * status may keep a released mortgage on record.
 */
export const certificateSchema = z.discriminatedUnion('status', [
  certificateBase.extend({
    status: z.literal('mortgaged'),
    mortgage: mortgageSchema.refine((mortgage) => mortgage.released_on === undefined, { path: ['released_on'] }),
  }),
  certificateBase.extend({
    status: z.enum(['valid', 'replaced', 'lost']),
    mortgage: mortgageSchema.refine((mortgage) => mortgage.released_on !== undefined, { path: ['released_on'] }).nullable(),
  }),
]);
export type Certificate = z.output<typeof certificateSchema>;

export const newCertificateSchema = certificateSchema.refine(identifies('certificate'), { error: UNIDENTIFIED });

/**
 * [app rule] What the certificate card claims (#356): `Còn hiệu lực` needs an issue date behind it; every other status
 * shows as stored.
 */
export function shownStatus(certificate: Pick<Certificate, 'status' | 'issued_on'>): CertificateStatus | 'undated' {
  return certificate.status === 'valid' && certificate.issued_on === null ? 'undated' : certificate.status;
}
