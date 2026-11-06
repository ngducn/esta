import 'server-only';
import type { Clock } from '@esta/core';
import type { CronJob } from '@esta/core/ops';
import { readRequestClock } from '../clock';
import { requireCronSecret } from './auth';
import { recordCronRun } from '@esta/ops';
import { describeRun, type CronResult } from './cron-runs';
import { cronClient, type CronClient } from './supabase';

/** Every run, including one that throws, leaves a `cron_runs` row, so a night that failed or never ran shows on the operator's status line. */
export function cronHandler(name: CronJob, job: (client: CronClient, clock: Clock) => Promise<CronResult>): (request: Request) => Promise<Response> {
  return async (request) => {
    const denied = requireCronSecret(request);
    if (denied) return denied;
    const client = cronClient();
    const clock = await readRequestClock();
    const startedAt = clock.now();
    let result: CronResult;
    try {
      result = await job(client, clock);
    } catch (thrown) {
      await recordCronRun(client, name, describeRun(startedAt, clock.now(), { thrown }));
      throw thrown;
    }
    await recordCronRun(client, name, describeRun(startedAt, clock.now(), result));
    return Response.json(result, { status: result.ok ? 200 : 500 });
  };
}
