'use server';

import { parseOtpInput } from '@esta/core/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { env } from '@/server/env';
import { finishSignIn } from '@/server/sign-in';
import { createCodeSender, createSessionClient } from '@/server/supabase/server';

export type SignInState =
  | { step: 'email'; email: string; error: 'invalid-email' | 'send-failed' | null }
  | { step: 'code'; email: string; error: 'wrong-code' | 'send-failed' | null; sentCount: number };

const emailSchema = z.email().transform((email) => email.toLowerCase());

const intentSchema = z.enum(['send', 'resend', 'verify', 'change-email']);

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

async function sendCode(email: string): Promise<boolean> {
  const { error } = await createCodeSender().auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  return error === null;
}

export async function signIn(previous: SignInState, formData: FormData): Promise<SignInState> {
  const intent = intentSchema.parse(formData.get('intent'));
  const rawEmail = field(formData, 'email');

  if (intent === 'change-email') return { step: 'email', email: rawEmail, error: null };

  const parsed = emailSchema.safeParse(rawEmail);
  if (!parsed.success) return { step: 'email', email: rawEmail, error: 'invalid-email' };
  const email = parsed.data;
  const sentCount = previous.step === 'code' ? previous.sentCount : 0;

  if (intent === 'send' || intent === 'resend') {
    if (!(await sendCode(email))) {
      return intent === 'send'
        ? { step: 'email', email, error: 'send-failed' }
        : { step: 'code', email, error: 'send-failed', sentCount };
    }
    return { step: 'code', email, error: null, sentCount: sentCount + 1 };
  }

  const code = parseOtpInput(field(formData, 'code'));
  if (!code.ok) return { step: 'code', email, error: 'wrong-code', sentCount };
  const supabase = await createSessionClient();
  const { error } = await supabase.auth.verifyOtp({ email, token: code.value, type: 'email' });
  if (error) return { step: 'code', email, error: 'wrong-code', sentCount };
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
