import { getClock } from '@/server/clock';
import { requireCronSecret } from '@/server/cron/auth';
import { keepAlive } from '@/server/cron/keep-alive';
import { cronClient } from '@/server/cron/supabase';

export async function GET(request: Request): Promise<Response> {
  const denied = requireCronSecret(request);
  if (denied) return denied;
  return Response.json(await keepAlive(cronClient(), await getClock()));
}
