import type { Database } from '@esta/db';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type AgentDb = SupabaseClient<Database>;

export function serviceClient(url: string, serviceRoleKey: string, workerId: string): AgentDb {
  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-esta-actor': `agent:${workerId}` } },
  });
}
