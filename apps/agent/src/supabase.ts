import type { Database } from '@esta/db';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type AgentDb = SupabaseClient<Database>;

/** The audit trigger accepts `agent:<id>` only with letters, digits, dot, underscore and hyphen (SPEC §5.7). */
export function workerIdFor(hostname: string): string {
  const id = hostname.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
  return id === '' ? 'worker' : id;
}

export function serviceClient(url: string, serviceRoleKey: string, workerId: string): AgentDb {
  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-esta-actor': `agent:${workerId}` } },
  });
}
