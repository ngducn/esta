import type { Database } from '@esta/db';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Always the member's own session client, so RLS decides every read and write and the audit log names the member. */
export type Db = SupabaseClient<Database>;
