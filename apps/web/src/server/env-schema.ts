import { assertClockAllowed } from '@esta/core';
import { z } from 'zod';

function isTimeZone(name: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: name });
    return true;
  } catch {
    return false;
  }
}

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  CRON_SECRET: z.string().min(1),
  EMAIL_TRANSPORT: z.enum(['smtp']).default('smtp'),
  SMTP_URL: z.url().optional(),
  ESTA_EMAIL_FROM: z.email().optional(),
  ESTA_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  ESTA_GOOGLE_AUTH: z.enum(['on', 'off']).default('off'),
  ESTA_ENV: z.enum(['development', 'test', 'preview', 'production']).default('development'),
  ESTA_FROZEN_NOW: z.iso.datetime({ offset: true }).optional(),
  ESTA_TIMEZONE: z.string().refine(isTimeZone, 'must be an IANA time zone').default('Asia/Ho_Chi_Minh'),
});

export type Env = z.infer<typeof schema>;
export type EstaEnv = Env['ESTA_ENV'];

export function parseEnv(source: Record<string, string | undefined>): Env {
  const nonEmpty = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ''));
  assertClockAllowed(nonEmpty);
  const result = schema.safeParse(nonEmpty);
  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
