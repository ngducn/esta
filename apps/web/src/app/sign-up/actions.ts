'use server';

import { parseNewPassword, parseOtpInput } from '@esta/core/auth';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { emailSchema, finishSignIn, formSecret, formText, savePassword, sendSignInCode, type SendFailure } from '@/server/sign-in';
import { createSessionClient } from '@/server/supabase/server';

/**
 * The password reaches Auth only after the code proves the inbox, so an unconfirmed account never holds one
 * (the drop_unconfirmed_password trigger refuses it anyway). The form carries it from the first step to the second.
 */
export type SignUpState =
  | { step: 'details'; email: string; error: 'invalid-email' | 'short-password' | 'long-password' | SendFailure | 'failed' | null }
  | { step: 'code'; email: string; code: string; error: 'missing-code' | 'wrong-code' | SendFailure | null; sentCount: number };

export type SignUpError = NonNullable<SignUpState['error']>;

const intentSchema = z.enum(['send', 'resend', 'verify', 'change-email']);

export async function signUp(previous: SignUpState, formData: FormData): Promise<SignUpState> {
  const intent = intentSchema.parse(formData.get('intent'));
  const rawEmail = formText(formData, 'email');

  if (intent === 'change-email') return { step: 'details', email: rawEmail, error: null };

  const parsed = emailSchema.safeParse(rawEmail);
  if (!parsed.success) return { step: 'details', email: rawEmail, error: 'invalid-email' };
  const email = parsed.data;
  const password = parseNewPassword(formSecret(formData, 'password'));
  if (!password.ok) return { step: 'details', email, error: password.reason === 'short' ? 'short-password' : 'long-password' };
  const sentCount = previous.step === 'code' ? previous.sentCount : 0;

  if (intent === 'send' || intent === 'resend') {
    const failure = await sendSignInCode(email);
    if (failure !== null) {
      return intent === 'send'
        ? { step: 'details', email, error: failure }
        : { step: 'code', email, code: '', error: failure, sentCount };
    }
    return { step: 'code', email, code: '', error: null, sentCount: sentCount + 1 };
  }

  const typed = formText(formData, 'code');
  if (typed === '') return { step: 'code', email, code: typed, error: 'missing-code', sentCount };
  const wrong: SignUpState = { step: 'code', email, code: typed, error: 'wrong-code', sentCount };
  const code = parseOtpInput(typed);
  if (!code.ok) return wrong;
  const supabase = await createSessionClient();
  const { error } = await supabase.auth.verifyOtp({ email, token: code.value, type: 'email' });
  if (error) return wrong;
  if (!(await savePassword(password.value))) return { step: 'details', email, error: 'failed' };
  redirect(await finishSignIn());
}
