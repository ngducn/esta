'use server';

import type { Result } from '@esta/core/result';
import { revalidatePath } from 'next/cache';
import { getClock } from '@/server/clock';
import { requireMember } from '@/server/member';
import { createSessionClient } from '@/server/supabase/server';

async function storeOnboarding(onboarding: Record<string, string>): Promise<boolean> {
  const member = await requireMember();
  const db = await createSessionClient();
  const { data, error } = await db.from('household_settings').update({ onboarding }).eq('household_id', member.household.id).select('id');
  if (error !== null || data.length !== 1) return false;
  revalidatePath('/');
  return true;
}

export async function dismissFirstRun(): Promise<Result<undefined>> {
  const clock = await getClock();
  return (await storeOnboarding({ dismissed_at: clock.now() })) ? { ok: true, value: undefined } : { ok: false, reason: 'failed' };
}

export async function restoreFirstRun(): Promise<{ readonly ok: boolean }> {
  return { ok: await storeOnboarding({}) };
}
