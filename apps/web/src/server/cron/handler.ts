import 'server-only';
import type { Clock } from '@esta/core';
import { readRequestClock } from '../clock';
import { requireCronSecret } from './auth';
import { cronClient, type CronClient } from './supabase';

export function cronHandler(job: (client: CronClient, clock: Clock) => Promise<object>): (request: Request) => Promise<Response> {
  return async (request) => {
    const denied = requireCronSecret(request);
    if (denied) return denied;
    return Response.json(await job(cronClient(), await readRequestClock()));
  };
}
