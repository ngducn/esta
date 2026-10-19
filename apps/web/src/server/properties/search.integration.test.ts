import { isoDate } from '@esta/core/date';
import { parsePropertyFilters } from '@esta/core/properties';
import type { Database } from '@esta/db';
import { findProperty } from '@esta/ops';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { DEMO_PASSWORD } from '../../../../../supabase/seed/generator/households.ts';
import { seedId } from '../../../../../supabase/seed/generator/ids.ts';

// `pnpm test:integration` (scripts/web-integration.ts) passes the slot's stack; run against a fresh `pnpm db:reset`.
// Reads only, so the seed stays as it was.
const { ESTA_IT_SUPABASE_URL: url, ESTA_IT_ANON_KEY: anonKey } = z.object({ ESTA_IT_SUPABASE_URL: z.url(), ESTA_IT_ANON_KEY: z.string().min(1) }).parse(process.env);
const EMAIL = 'ryan.lane8@demo.esta.test';
const HOUSEHOLD = seedId('seed:household:lane-8');
const client: SupabaseClient<Database> = createClient<Database>(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

vi.mock('server-only', () => ({}));
vi.mock('@/server/member', () => ({ requireMember: async () => ({ household: { id: HOUSEHOLD } }) }));
vi.mock('@/server/supabase/server', () => ({ createSessionClient: async () => client }));

const { listProperties } = await import('./list');

beforeAll(async () => {
  const { error } = await client.auth.signInWithPassword({ email: EMAIL, password: DEMO_PASSWORD });
  if (error) throw error;
});

describe('one property search for the list screen and the connector', () => {
  it.each(['demo', 'bao loc', 'binh duong', 'Dĩ An, Bình Dương', 'quan 7', 'nguyen an ninh di an', 'DIAN', 'không có gì'])(
    'finds the same properties for "%s"',
    async (q) => {
      const list = await listProperties(HOUSEHOLD, parsePropertyFilters({ q }), isoDate('2026-10-07'));
      const found = await findProperty({ db: client, householdId: HOUSEHOLD, locale: 'vi' }, q);
      expect(found.map((candidate) => candidate.id).toSorted()).toEqual(list.rows.map((row) => row.id).toSorted());
    },
  );
});
