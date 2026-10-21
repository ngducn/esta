import type { Locale } from '@esta/core/format';
import type { Result } from '@esta/core/result';
import type { Database } from '@esta/db';
import { readMembership, type Db } from '@esta/ops';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { SecretStore } from './store';

export const connectorEnvSchema = z.object({
  ESTA_SUPABASE_URL: z.url(),
  ESTA_SUPABASE_ANON_KEY: z.string().min(1),
  ESTA_SESSION_FILE: z.string().min(1).optional(),
  ESTA_ENV: z.enum(['development', 'test', 'preview', 'production']).optional(),
  ESTA_FROZEN_NOW: z.string().min(1).optional(),
  ESTA_TIMEZONE: z.string().default('Asia/Ho_Chi_Minh'),
  /** Folders beside `~/Esta-import` that the file tools may read, separated like PATH. */
  ESTA_IMPORT_ROOTS: z.string().optional(),
});

export type ConnectorEnv = z.infer<typeof connectorEnvSchema>;

const STORAGE_KEY = 'session';

/**
 * Ryan's own session against the anon key, so RLS and the audit trigger see him. supabase-js refreshes an expired
 * access token on the next request and writes the rotated refresh token back through the store.
 */
export function connectorClient(env: Pick<ConnectorEnv, 'ESTA_SUPABASE_URL' | 'ESTA_SUPABASE_ANON_KEY'>, store: SecretStore): Db {
  return createClient<Database>(env.ESTA_SUPABASE_URL, env.ESTA_SUPABASE_ANON_KEY, {
    auth: { storage: store, storageKey: STORAGE_KEY, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false, flowType: 'implicit' },
  });
}

/**
 * Ryan's session for the writes of one batch: each request carries `x-esta-via: claude` and `x-esta-batch`, which the
 * audit trigger stores, and takes its token from `session`, which alone signs in and refreshes.
 */
export function batchClient(env: Pick<ConnectorEnv, 'ESTA_SUPABASE_URL' | 'ESTA_SUPABASE_ANON_KEY'>, session: Db, batchId: string): Db {
  return createClient<Database>(env.ESTA_SUPABASE_URL, env.ESTA_SUPABASE_ANON_KEY, {
    accessToken: async () => (await session.auth.getSession()).data.session?.access_token ?? null,
    global: { headers: { 'x-esta-via': 'claude', 'x-esta-batch': batchId } },
  });
}

export type Operator = { readonly userId: string; readonly householdId: string; readonly householdName: string; readonly locale: Locale };

export type OperatorRefusal = 'signed_out' | 'no_household' | 'not_operator';

/** The household Esta opens for this user, and only when the user is its operator (CONNECTOR §3.3). */
export async function currentOperator(db: Db): Promise<Result<Operator, OperatorRefusal>> {
  const { data: claims } = await db.auth.getClaims();
  if (claims === null) return { ok: false, reason: 'signed_out' };
  const data = await readMembership(db, claims.claims.sub);
  if (data === null) return { ok: false, reason: 'no_household' };
  if (!data.is_operator) return { ok: false, reason: 'not_operator' };
  return {
    ok: true,
    value: { userId: claims.claims.sub, householdId: data.household.id, householdName: data.household.name, locale: data.household.locale === 'en' ? 'en' : 'vi' },
  };
}
