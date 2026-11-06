import 'server-only';
import { firstRunState, type FirstRunRole, type FirstRunState } from '@esta/core/onboarding';
import { z } from 'zod';
import { can } from '@/server/access';
import { createSessionClient } from '@/server/supabase/server';

const settingsSchema = z.object({ onboarding: z.object({ dismissed_at: z.string().nullable().optional() }) });

/**
 * What the first-run checklist shows, read as the member. Any failed read returns null: three undone steps stated as fact for a
 * household that may have all of them is worse than showing nothing.
 */
export async function loadFirstRun(householdId: string, role: FirstRunRole): Promise<FirstRunState | null> {
  if (!can({ role }, 'household')) return null;
  const db = await createSessionClient();
  try {
    const [properties, accounts, members, settings] = await Promise.all([
      db.from('properties').select('id', { count: 'exact', head: true }).eq('household_id', householdId).is('deleted_at', null),
      db.from('bank_accounts').select('id', { count: 'exact', head: true }).eq('household_id', householdId),
      db.from('household_members').select('id', { count: 'exact', head: true }).eq('household_id', householdId),
      db.from('household_settings').select('onboarding').eq('household_id', householdId).maybeSingle(),
    ]);
    const counts = [properties, accounts, members];
    if (counts.some((result) => result.error !== null || result.count === null) || settings.error !== null || settings.data === null) return null;
    const parsed = settingsSchema.safeParse(settings.data);
    if (!parsed.success) return null;
    return firstRunState({
      role,
      propertyCount: properties.count ?? 0,
      bankAccountCount: accounts.count ?? 0,
      memberCount: members.count ?? 0,
      dismissedAt: parsed.data.onboarding.dismissed_at ?? null,
    });
  } catch {
    return null;
  }
}
