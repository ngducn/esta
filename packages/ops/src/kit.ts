import { isDeepStrictEqual } from 'node:util';
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

type Columns<T> = { -readonly [K in keyof T]?: T[K] };
export type Changed<T> = { readonly before: Columns<T>; readonly set: Columns<T> };

/** The columns an edit changes, with their values before and after; null when it changes none. */
export function changedColumns<T>(current: T, next: T, keys: readonly (keyof T)[]): Changed<T> | null {
  const before: Columns<T> = {};
  const set: Columns<T> = {};
  for (const key of keys.filter((column) => !isDeepStrictEqual(current[column], next[column]))) {
    before[key] = current[key];
    set[key] = next[key];
  }
  return Object.keys(set).length === 0 ? null : { before, set };
}

/** PostgREST caps a response at `max_rows` (1000 in `supabase/config.toml`), and a household may hold more. */
const PAGE_SIZE = 1000;

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/** `page` must order the rows, or PostgREST ranges can overlap and skip rows. */
export async function readAll<T>(what: string, page: (from: number, to: number) => Page<T>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Reading ${what} failed: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE_SIZE) return rows;
  }
}
