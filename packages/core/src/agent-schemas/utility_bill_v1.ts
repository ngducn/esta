import { z } from 'zod';
import { parseDecimal } from '../parse/decimal';
import { parseVndInput } from '../parse/vnd-input';
import { leaf } from './certificate_v1';

export const UTILITY_BILL_KINDS = ['electricity', 'water', 'internet', 'other'] as const;

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const CONSUMPTION_UNIT = /\s*(?:kwh|m3|m³|số)\s*$/iu;

/** Reads an amount printed the Vietnamese way, so `1.234.567 đ` is 1234567. */
function parseAmount(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  const parsed = parseVndInput(raw);
  return parsed.ok ? parsed.value : raw;
}

export function parseConsumption(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  const decimal = parseDecimal(raw.trim().replace(CONSUMPTION_UNIT, ''));
  return decimal === null ? raw : Number(decimal.digits) / 10 ** decimal.scale;
}

const text = leaf(z.string());
/** [app rule] Below a billion đồng, so a national ID cannot pass as an amount (SPEC D11). */
export const amountLeaf = leaf(z.preprocess(parseAmount, z.number().int().nonnegative().max(999_999_999)));

/** AGENT.md §5.1: one electricity, water or internet bill, every printed value a `{ value, confidence, page }` leaf. */
export const utilityBillV1Schema = z.object({
  kind: leaf(z.enum(UTILITY_BILL_KINDS)),
  provider: text,
  customer_code: text,
  holder_name: text,
  address_text: text,
  period: leaf(z.string().regex(MONTH, 'expected YYYY-MM')),
  amount_vnd: amountLeaf,
  consumption: leaf(z.preprocess(parseConsumption, z.number().nonnegative().max(100_000_000))),
  /** The bill's printed text, not a reviewed field: P2-05 copies it into `documents.ocr_text` for search. */
  full_text: z.string().optional(),
});

export type UtilityBillV1 = z.infer<typeof utilityBillV1Schema>;
