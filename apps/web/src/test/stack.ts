import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { join } from 'node:path';
import { vi } from 'vitest';
import { e2eServiceHeaders } from '../../../../scripts/e2e-service';
import { parseSlot } from '../../../../scripts/slot';
import { slotEnv } from '../../../../scripts/slot-env';

// The vitest config's placeholder Supabase URL and key would shadow the slot's real ones.
vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', undefined);
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', undefined);
const env = slotEnv(join(import.meta.dirname, '../../../..'), parseSlot(process.env.ESTA_SLOT));
vi.unstubAllEnvs();
const url = env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** The slot's local stack answers; the tests that need it skip without it. */
export const stackUp = anonKey !== '' && (await fetch(`${url}/auth/v1/health`, { headers: { apikey: anonKey } }).then((r) => r.ok, () => false));
export const stackName = `the ESTA_SLOT=${process.env.ESTA_SLOT ?? 0} stack`;

// Each call of e2eServiceHeaders runs `supabase status`; one key per run keeps many requests from racing it.
let headers: Record<string, string> | undefined;
const serviceHeaders = () => (headers ??= e2eServiceHeaders());

/** A session client of a seeded user, signed in with the one-time code the admin API mints, as a member's request is. */
export async function signedInAs(email: string): Promise<SupabaseClient> {
  const link = await fetch(`${url}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: { ...serviceHeaders(), 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', email }),
  });
  const { email_otp: token } = (await link.json()) as { email_otp: string };
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw error;
  return client;
}

/** A service-role request to the stack, `/rest/v1/...` or `/storage/v1/...`, for setup, cleanup and reading what was written. */
export async function service<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${url}${path}`, {
    ...init,
    headers: { ...serviceHeaders(), 'content-type': 'application/json', prefer: 'return=representation', ...init.headers },
  });
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path}: ${response.status} ${await response.text()}`);
  return (await response.json().catch(() => null)) as T;
}

/** Sends bytes to an upload URL a ticket signed, as the browser does. */
export const putSigned = (signedUrl: string, body: Buffer, type: string) =>
  fetch(signedUrl, { method: 'PUT', body: new Blob([new Uint8Array(body)]), headers: { 'content-type': type, 'x-upsert': 'true' } });
