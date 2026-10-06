import 'server-only';
import { carryCookieLocaleToMember } from '@/server/locale';
import { createSessionClient } from '@/server/supabase/server';

/** Runs after any sign-in method: claim invites for this email, then pick the landing page. */
export async function finishSignIn(): Promise<'/' | '/onboarding'> {
  const supabase = await createSessionClient();
  const { error } = await supabase.rpc('claim_pending_invites');
  if (error) throw new Error(`claim_pending_invites failed: ${error.message}`);
  await carryCookieLocaleToMember();
  return (await hasMembership()) ? '/' : '/onboarding';
}

async function hasMembership(): Promise<boolean> {
  const supabase = await createSessionClient();
  const { count, error } = await supabase.from('household_members').select('id', { count: 'exact', head: true });
  if (error) throw new Error(`Reading memberships failed: ${error.message}`);
  return (count ?? 0) > 0;
}
