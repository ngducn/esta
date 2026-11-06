import 'server-only';
import type { Clock } from '@esta/core';
import { readGlobalClock } from '../clock';
import { requireCronSecret } from './auth';
import { cronClient, type CronClient } from './supabase';

export function cronHandler(job: (client: CronClient, clock: Clock) => Promise<{ readonly ok: boolean }>): (request: Request) => Promise<Response> {
  return async (request) => {
    const denied = requireCronSecret(request);
    if (denied) return denied;
    const result = await job(cronClient(), await readGlobalClock());
    return Response.json(result, { status: result.ok ? 200 : 500 });
  };
}
