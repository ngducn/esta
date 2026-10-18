import 'server-only';
import type { Password } from '@esta/core/auth';
import type { AuthError } from '@supabase/supabase-js';
import { z } from 'zod';
import { carryCookieLocaleToMember } from '@/server/locale';
import { createCodeSender, createSessionClient } from '@/server/supabase/server';

export type SendFailure = 'send-failed' | 'rate-limited';

export const emailSchema = z.email().transform((email) => email.toLowerCase());

export function formText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

/** A password keeps its spaces. */
export function formSecret(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

function sendFailure(error: AuthError | null): SendFailure | null {
  if (error === null) return null;
  return error.status === 429 ? 'rate-limited' : 'send-failed';
}

/** A new address gets the confirmation email and a known one the sign-in email; both carry a 6-digit code. */
export async function sendSignInCode(email: string): Promise<SendFailure | null> {
  const { error } = await createCodeSender().auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  return sendFailure(error);
}

/** Auth answers the same whether or not the address has an account, and sends mail only when it has one. */
export async function sendResetCode(email: string): Promise<SendFailure | null> {
  const { error } = await createCodeSender().auth.resetPasswordForEmail(email);
  return sendFailure(error);
}

/**
 * Sets the signed-in user's password. A password matching the current one already holds, so it counts as saved.
 * On failure the session ends, so nobody stays signed in believing a password was saved.
 */
export async function savePassword(password: Password): Promise<boolean> {
  const supabase = await createSessionClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error === null || error.code === 'same_password') return true;
  await supabase.auth.signOut({ scope: 'local' });
  return false;
}

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
