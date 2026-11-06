import { businessDate, parseInstant, type Instant } from '@esta/core';
import { z } from 'zod';
import { requireCronSecret } from '@/server/cron/auth';
import { cronClient } from '@/server/cron/supabase';
import { clearTestClock, setTestClock } from '@/server/cron/test-clock';
import { isDevSurfaceEnabled } from '@/server/dev-guard';
import { env } from '@/server/env';

const body = z.object({ frozen_now: z.string() });

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
  try {
    frozenNow = parseInstant(body.parse(await request.json()).frozen_now);
  } catch {
    return Response.json({ ok: false, error: 'expected {"frozen_now":"<ISO date-time with offset>"}' }, { status: 400 });
  }
  await setTestClock(cronClient(), frozenNow);
  return Response.json({ ok: true, frozen_now: frozenNow, as_of: businessDate(frozenNow, env.ESTA_TIMEZONE) });
}

export async function DELETE(request: Request): Promise<Response> {
  const denied = guard(request);
  if (denied) return denied;
  await clearTestClock(cronClient());
  return Response.json({ ok: true, frozen_now: null });
}
