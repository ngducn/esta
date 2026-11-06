import { z } from 'zod';

const USAGE = 'Usage: pnpm lane:otp <email>';
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);

type Source = Readonly<Record<string, string | undefined>>;

export type LaneOtpTarget = { readonly url: string; readonly serviceRoleKey: string };
export type LaneOtpCheck = { readonly target: LaneOtpTarget } | { readonly exitCode: 1 | 2; readonly message: string };

const generated = z.object({ email_otp: z.string().regex(/^\d{6}$/) });

/** A cloud project's reference is the first label of its host; a local stack has no reference, so its whole host stands in. */
export function projectRef(url: string): string | undefined {
  const host = URL.parse(url)?.hostname;
  if (host === undefined || host === '') return undefined;
  return LOCAL_HOSTS.has(host) ? host : host.split('.')[0];
}

export function checkLaneOtp(email: string | undefined, source: Source): LaneOtpCheck {
  if (email === undefined || !email.includes('@')) return { exitCode: 2, message: USAGE };
  if (source.ESTA_ENV !== 'preview') {
    return { exitCode: 1, message: `Refusing: ESTA_ENV is ${source.ESTA_ENV ? `"${source.ESTA_ENV}"` : 'unset'}, and lane sign-in codes are for ESTA_ENV=preview only` };
  }
  const expected = source.ESTA_PREVIEW_PROJECT_REF;
  if (expected === undefined || expected === '') {
    return { exitCode: 1, message: 'Refusing: ESTA_PREVIEW_PROJECT_REF is not set' };
  }
  const url = source.SUPABASE_URL;
  const actual = url === undefined ? undefined : projectRef(url);
  if (url === undefined || actual !== expected) {
    return { exitCode: 1, message: `Refusing: SUPABASE_URL points at project ${actual ?? 'none'}, not the preview project ${expected}` };
  }
  const serviceRoleKey = source.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceRoleKey === undefined || serviceRoleKey === '') {
    return { exitCode: 1, message: 'Refusing: SUPABASE_SERVICE_ROLE_KEY is not set' };
  }
  return { target: { url, serviceRoleKey } };
}

/** generate_link creates the code without sending any email. */
export async function fetchLaneOtp(email: string, target: LaneOtpTarget, fetchImpl: typeof fetch = fetch): Promise<string> {
  const response = await fetchImpl(`${target.url}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {
      apikey: target.serviceRoleKey,
      authorization: `Bearer ${target.serviceRoleKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ type: 'magiclink', email }),
  });
  if (!response.ok) throw new Error(`generate_link for ${email} failed: ${response.status} ${await response.text()}`);
  return generated.parse(await response.json()).email_otp;
}

if (import.meta.main) {
  const check = checkLaneOtp(process.argv[2], process.env);
  if ('exitCode' in check) {
    console.error(check.message);
    process.exit(check.exitCode);
  }
  try {
    console.log(await fetchLaneOtp(process.argv[2] ?? '', check.target));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
