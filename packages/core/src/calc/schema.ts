import { z } from 'zod';
import { isoDate } from '../date/iso-date';
import { vnd } from '../money/vnd';
import type { TypedValue } from './types';

/** The parser of a `TypedValue` that came from outside the type system, such as a `_typed` field in a tool record. A kind added to `TypedValue` must be added here; `schema.test.ts` fails to compile until it is. */
export const typedValueSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('vnd'), value: z.number().int().transform(vnd) }),
  z.strictObject({ kind: z.literal('bp'), value: z.number().int() }),
  z.strictObject({ kind: z.literal('count'), value: z.number().int(), unit: z.string() }),
  z.strictObject({ kind: z.literal('months'), value: z.number().int() }),
  z.strictObject({ kind: z.literal('date'), value: z.string().transform(isoDate) }),
]) satisfies z.ZodType<TypedValue, unknown>;
