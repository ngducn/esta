'use server';

import { parseNewPassword, parseOtpInput } from '@esta/core/auth';
import { z } from 'zod';
import { emailSchema, finishSignIn, formSecret, formText, savePassword, sendResetCode } from '@/server/sign-in';
import { createSessionClient } from '@/server/supabase/server';

export type ResetState =
  | { step: 'email'; email: string; error: 'invalid-email' | 'send-failed' | null }
  | {
      step: 'code';
      email: string;
      code: string;
      error: 'missing-code' | 'wrong-code' | 'short-password' | 'long-password' | 'failed' | 'send-failed' | null;
      sentCount: number;
    }
  | { step: 'done'; next: '/' | '/onboarding' };

type CodeStepError = NonNullable<Extract<ResetState, { step: 'code' }>['error']>;

export type ResetError = NonNullable<Extract<ResetState, { step: 'email' }>['error']> | CodeStepError;

const intentSchema = z.enum(['send', 'resend', 'reset', 'change-email']);

export async function resetPassword(previous: ResetState, formData: FormData): Promise<ResetState> {
  const intent = intentSchema.parse(formData.get('intent'));
  const rawEmail = formText(formData, 'email');

  if (intent === 'change-email') return { step: 'email', email: rawEmail, error: null };

  const parsed = emailSchema.safeParse(rawEmail);
  if (!parsed.success) return { step: 'email', email: rawEmail, error: 'invalid-email' };
  const email = parsed.data;
  const sentCount = previous.step === 'code' ? previous.sentCount : 0;

  if (intent === 'send' || intent === 'resend') {
    const failure = await sendResetCode(email);
    if (failure !== null) {
      return intent === 'send'
        ? { step: 'email', email, error: failure }
        : { step: 'code', email, code: '', error: failure, sentCount };
    }
    return { step: 'code', email, code: '', error: null, sentCount: sentCount + 1 };
  }

  const typed = formText(formData, 'code');
  const codeStep = (error: CodeStepError): ResetState => ({ step: 'code', email, code: typed, error, sentCount });
  if (typed === '') return codeStep('missing-code');
  const password = parseNewPassword(formSecret(formData, 'password'));
  if (!password.ok) return codeStep(password.reason === 'short' ? 'short-password' : 'long-password');
  const code = parseOtpInput(typed);
  if (!code.ok) return codeStep('wrong-code');
  const supabase = await createSessionClient();
  const { error } = await supabase.auth.verifyOtp({ email, token: code.value, type: 'recovery' });
  if (error) return codeStep('wrong-code');
  if (!(await savePassword(password.value))) return { step: 'code', email, code: '', error: 'failed', sentCount };
  return { step: 'done', next: await finishSignIn() };
}
