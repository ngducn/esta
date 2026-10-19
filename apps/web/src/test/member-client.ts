import type { Database } from '@esta/db';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { vi } from 'vitest';
import { z } from 'zod';
import { clearMailbox, latestCode } from '../../../../scripts/inbucket-code.ts';

const { ESTA_IT_SUPABASE_URL: url, ESTA_IT_ANON_KEY: anonKey, ESTA_IT_MAILBOX: api } = z
  .object({ ESTA_IT_SUPABASE_URL: z.url(), ESTA_IT_ANON_KEY: z.string().min(1), ESTA_IT_MAILBOX: z.url() })
  .parse(process.env);

/**
 * Server code under test runs as a seeded member of `householdId`, on the slot `pnpm test:integration`
 * (scripts/web-integration.ts) passes: `createSessionClient` returns this member's client and `requireMember` their
 * household. Call it before the `await import()` of the module under test, and `signIn` in `beforeAll`: it signs the
 * member in through the slot's mailbox like a person, so every read and write runs under RLS.
 */
export function memberClient(email: string, householdId: string): { client: SupabaseClient<Database>; signIn: () => Promise<void> } {
  const client = createClient<Database>(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  vi.doMock('server-only', () => ({}));
  vi.doMock('next/cache', () => ({ revalidatePath: () => undefined }));
  vi.doMock('@/server/member', () => ({ requireMember: async () => ({ household: { id: householdId } }) }));
  vi.doMock('@/server/supabase/server', () => ({ createSessionClient: async () => client }));
  const signIn = async () => {
    await clearMailbox(email, { api });
    const sent = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    if (sent.error) throw sent.error;
    const verified = await client.auth.verifyOtp({ email, token: await latestCode(email, { api }), type: 'email' });
    if (verified.error) throw verified.error;
  };
  return { client, signIn };
}
