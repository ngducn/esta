import type { Database } from '@esta/db';
import type { SupabaseClient } from '@supabase/supabase-js';
import { vi } from 'vitest';
import { signedInAs } from './stack';

/**
 * Server code under test runs as a seeded member of `householdId`, on the slot `pnpm test:integration`
 * (scripts/web-integration.ts) passes: `createSessionClient` returns this member's client and `requireMember` their
 * household. Call it before the `await import()` of the module under test, and `signIn` in `beforeAll`: it signs the
 * member in with `signedInAs`, so every read and write through `client` runs under RLS.
 */
export function memberClient(email: string, householdId: string): { client: SupabaseClient<Database>; signIn: () => Promise<void> } {
  let signed: SupabaseClient<Database> | undefined;
  const client = new Proxy({} as SupabaseClient<Database>, {
    get(_target, key) {
      if (!signed) throw new Error('memberClient: call signIn() in beforeAll first');
      return Reflect.get(signed, key, signed);
    },
  });
  vi.doMock('server-only', () => ({}));
  vi.doMock('next/cache', () => ({ revalidatePath: () => undefined }));
  vi.doMock('@/server/member', () => ({ requireMember: async () => ({ household: { id: householdId } }) }));
  vi.doMock('@/server/supabase/server', () => ({ createSessionClient: async () => client }));
  const signIn = async () => {
    signed = (await signedInAs(email)) as SupabaseClient<Database>;
  };
  return { client, signIn };
}
