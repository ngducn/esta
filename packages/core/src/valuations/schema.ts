import { z } from 'zod';
import type { IsoDate } from '../date/iso-date';
import { MAX_AMOUNT_VND, vnd } from '../money/vnd';
import { parseDateUpToToday, type PastDateReason } from '../parse/date-input';
import { parsePositiveVnd, type PositiveVndReason } from '../parse/vnd-input';
import type { Result } from '../result';
import { isoDateSchema } from '../schemas/legal';

/** SPEC §5.3, in the order the sheet offers them. */
export const VALUATION_METHODS = ['owner_estimate', 'broker_quote', 'state_price_reference', 'comparables'] as const;
export type ValuationMethod = (typeof VALUATION_METHODS)[number];

export const MAX_VALUATION_NOTE = 1000;
export const MAX_SOURCE_URL = 2000;

/** A link Mẹ can open safely: `https:` only, so no `javascript:` or plain-text page reaches a tap. */
function isHttpsUrl(text: string): boolean {
  if (text.length > MAX_SOURCE_URL || /\s/.test(text)) return false;
  return URL.parse(text)?.protocol === 'https:';
}

const trimmedOrNull = (max: number) =>
  z
    .string()
    .max(max)
    .default('')
    .transform((text) => (text.trim() === '' ? null : text.trim()));

/** A valuation as the database holds it, for the write and for every read. */
export const valuationSchema = z.strictObject({
  id: z.uuid(),
  propertyId: z.uuid(),
  asOf: isoDateSchema,
  valueVnd: z.number().int().min(1).max(MAX_AMOUNT_VND).transform(vnd),
  method: z.enum(VALUATION_METHODS),
  sourceUrl: z.string().refine(isHttpsUrl).nullable(),
  note: z.string().max(MAX_VALUATION_NOTE).nullable(),
});
export type Valuation = z.output<typeof valuationSchema>;

export type ValuationProblems = {
  readonly value?: PositiveVndReason;
  readonly asOf?: PastDateReason;
  readonly sourceUrl?: 'not_https';
  readonly form?: 'invalid';
};

/** The id comes from the sheet, so a retried save writes one row. */
const textsSchema = z.object({
  id: z.uuid(),
  propertyId: z.uuid(),
  method: z.enum(VALUATION_METHODS),
  value: z.string(),
  asOf: z.string().default(''),
  sourceUrl: trimmedOrNull(MAX_SOURCE_URL),
  note: trimmedOrNull(MAX_VALUATION_NOTE),
});

/**
 * The valuation sheet as Mẹ filled it (FIN-5): `9ty5` is 9.500.000.000, the date reads `dd/mm/yyyy`, and a source must
 * be an `https:` link. Each field is refused on its own, all at once; anything else that does not parse is a `form`
 * problem, which the sheet never sends.
 */
export function readValuation(input: unknown, today: IsoDate): Result<Valuation, ValuationProblems> {
  const texts = textsSchema.safeParse(input);
  if (!texts.success) return { ok: false, reason: { form: 'invalid' } };
  const { value, asOf, sourceUrl, ...fields } = texts.data;
  const amount = parsePositiveVnd(value);
  const day = parseDateUpToToday(asOf, today);
  const https = sourceUrl === null || isHttpsUrl(sourceUrl);
  if (amount.ok && day.ok && https) return { ok: true, value: { ...fields, valueVnd: amount.value, asOf: day.value, sourceUrl } };
  return {
    ok: false,
    reason: {
      ...(amount.ok ? {} : { value: amount.reason }),
      ...(day.ok ? {} : { asOf: day.reason }),
      ...(https ? {} : { sourceUrl: 'not_https' }),
    },
  };
}

