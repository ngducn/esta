import { z } from 'zod';

export const idSchema = z.uuid();
export const optionalIdSchema = idSchema.nullable();

/** What every refusal has: a `kind` the caller switches on. An op adds its own kinds with their payload. */
export type Refusal = { readonly kind: string };

export type Issue = { readonly path: string; readonly code: string };

/**
 * Refusals any op may return. `conflict` is a unique, foreign-key or exclusion violation at apply time; the runner
 * plans again to say what it was, so an op never reads a constraint name.
 */
export type CommonRefusal =
  | { readonly kind: 'invalid'; readonly issues: readonly Issue[] }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'forbidden' }
  | { readonly kind: 'conflict' }
  | { readonly kind: 'failed' };

/** Paths and codes only: zod's English messages never reach Mẹ or Claude. */
export function invalid(error: z.ZodError): CommonRefusal {
  return { kind: 'invalid', issues: error.issues.map((issue) => ({ path: issue.path.join('.'), code: issue.code })) };
}

const BY_SQLSTATE: Readonly<Record<string, CommonRefusal>> = {
  '23505': { kind: 'conflict' },
  '23503': { kind: 'conflict' },
  '23P01': { kind: 'conflict' },
  '23514': { kind: 'invalid', issues: [] },
  '22P02': { kind: 'invalid', issues: [] },
  '22023': { kind: 'invalid', issues: [] },
  '42501': { kind: 'forbidden' },
};

export type DatabaseError = { readonly code: string; readonly message: string };

/**
 * The one reader of SQLSTATE codes (issue #188). An `ESTA_*` message raised by a definer function names its refusal
 * first, from the feature's own table; otherwise the code's class decides, and anything unknown is `failed`.
 */
export function dbRefusal<S extends Refusal = never>(error: DatabaseError, sentinels: Readonly<Record<string, S>> = {}): S | CommonRefusal {
  const sentinel = Object.hasOwn(sentinels, error.message) ? sentinels[error.message] : undefined;
  return sentinel ?? BY_SQLSTATE[error.code] ?? { kind: 'failed' };
}
