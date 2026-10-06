import { join } from 'node:path';
import { parseSlot } from '../../scripts/slot.ts';
import { slotEnv } from '../../scripts/slot-env.ts';

const env = slotEnv(join(import.meta.dirname, '..', '..'), parseSlot(process.env.ESTA_SLOT));

export const authApi = {
  url: `${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`,
  headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '' },
};
