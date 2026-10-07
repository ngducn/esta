import 'server-only';
import type { Database } from '@esta/db';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { env } from '../env';

export type CronClient = SupabaseClient<Database>;

const serviceRoleKey = z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required by cron routes');

export function cronClient(): CronClient {
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, serviceRoleKey.parse(process.env.SUPABASE_SERVICE_ROLE_KEY), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-esta-actor': 'system:cron' } },
  });
}
