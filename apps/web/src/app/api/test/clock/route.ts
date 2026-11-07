import { businessDate, parseInstant, type Instant } from '@esta/core';
import { z } from 'zod';
import { requireCronSecret } from '@/server/cron/auth';
import { cronClient } from '@/server/cron/supabase';
import { clearTestClock, setTestClock } from '@/server/cron/test-clock';
import { isDevSurfaceEnabled } from '@/server/dev-guard';
import { env } from '@/server/env';

const households = z.array(z.uuid()).min(1).nullable();
const setBody = z.object({ frozen_now: z.string(), households });
const clearBody = z.object({ households });

function guard(request: Request): Response | null {
  if (!isDevSurfaceEnabled(env)) return new Response(null, { status: 404 });
  return requireCronSecret(request);
}

/** Reads nothing. It exists so `pnpm smoke` can tell this route hidden (404) from visible (401 without the secret) with a GET, since a route with no GET answers 405 before its guard runs. */
export async function GET(request: Request): Promise<Response> {
  return guard(request) ?? new Response(null, { status: 405, headers: { allow: 'POST, DELETE' } });
}

export async function POST(request: Request): Promise<Response> {
  const denied = guard(request);
  if (denied) return denied;
  let frozenNow: Instant;
  let scope: readonly string[] | null;
  try {
    const body = setBody.parse(await request.json());
    frozenNow = parseInstant(body.frozen_now);
    scope = body.households;
  } catch {
    return Response.json({ ok: false, error: 'expected {"frozen_now":"<ISO date-time with offset>","households":[<uuid>...] | null}' }, { status: 400 });
  }
  await setTestClock(cronClient(), frozenNow, scope);
  return Response.json({ ok: true, frozen_now: frozenNow, households: scope, as_of: businessDate(frozenNow, env.ESTA_TIMEZONE) });
}

export async function DELETE(request: Request): Promise<Response> {
  const denied = guard(request);
  if (denied) return denied;
  const parsed = clearBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, error: 'expected {"households":[<uuid>...] | null}' }, { status: 400 });
  await clearTestClock(cronClient(), parsed.data.households);
  return Response.json({ ok: true, frozen_now: null, households: parsed.data.households });
}
