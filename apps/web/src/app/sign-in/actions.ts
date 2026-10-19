'use server';

import { parseOtpInput, parsePassword } from '@esta/core/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { env } from '@/server/env';
import { emailSchema, finishSignIn, formSecret, formText, sendSignInCode, type SendFailure } from '@/server/sign-in';
import { createSessionClient } from '@/server/supabase/server';

export type SignInState =
  | { step: 'email'; email: string; error: 'invalid-email' | SendFailure | null }
  | { step: 'code'; email: string; code: string; error: 'missing-code' | 'wrong-code' | SendFailure | null; sentCount: number };

export type SignInError = NonNullable<SignInState['error']>;

const intentSchema = z.enum(['send', 'resend', 'verify', 'change-email']);

export async function signIn(previous: SignInState, formData: FormData): Promise<SignInState> {
  const intent = intentSchema.parse(formData.get('intent'));
  const rawEmail = formText(formData, 'email');

  if (intent === 'change-email') return { step: 'email', email: rawEmail, error: null };

  const parsed = emailSchema.safeParse(rawEmail);
  if (!parsed.success) return { step: 'email', email: rawEmail, error: 'invalid-email' };
  const email = parsed.data;
  const sentCount = previous.step === 'code' ? previous.sentCount : 0;

  if (intent === 'send' || intent === 'resend') {
    const failure = await sendSignInCode(email);
    if (failure !== null) {
      return intent === 'send'
        ? { step: 'email', email, error: failure }
        : { step: 'code', email, code: '', error: failure, sentCount };
    }
    return { step: 'code', email, code: '', error: null, sentCount: sentCount + 1 };
  }

  const typed = formText(formData, 'code');
  if (typed === '') return { step: 'code', email, code: typed, error: 'missing-code', sentCount };
  const wrong: SignInState = { step: 'code', email, code: typed, error: 'wrong-code', sentCount };
  const code = parseOtpInput(typed);
  if (!code.ok) return wrong;
  const supabase = await createSessionClient();
  const { error } = await supabase.auth.verifyOtp({ email, token: code.value, type: 'email' });
  if (error) return wrong;
  redirect(await finishSignIn());
}

export type PasswordSignInState = {
  email: string;
  error: 'invalid-email' | 'missing-password' | 'wrong-password' | 'rate-limited' | 'failed' | null;
};

export async function signInWithPassword(_previous: PasswordSignInState, formData: FormData): Promise<PasswordSignInState> {
  const rawEmail = formText(formData, 'email');
  const parsed = emailSchema.safeParse(rawEmail);
  if (!parsed.success) return { email: rawEmail, error: 'invalid-email' };
  const email = parsed.data;
  const password = parsePassword(formSecret(formData, 'password'));
  if (!password.ok) return { email, error: 'missing-password' };
  const supabase = await createSessionClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password: password.value });
  // Auth answers 400 both for a wrong password and for an address with no account, so the error tells nobody which.
  if (error) return { email, error: error.status === 429 ? 'rate-limited' : error.status === 400 ? 'wrong-password' : 'failed' };
  redirect(await finishSignIn());
}

export async function signInWithGoogle(): Promise<void> {
  if (env.ESTA_GOOGLE_AUTH !== 'on') throw new Error('Google sign-in is off');
  const origin = (await headers()).get('origin');
  const supabase = await createSessionClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${origin ?? ''}/sign-in/callback` },
  });
  redirect(error || !data.url ? '/sign-in?error=google' : data.url);
}
