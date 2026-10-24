import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import agentPackage from '../package.json' with { type: 'json' };
import { readClock } from '@esta/ops';
import { assertStartAllowed, parseAgentEnv } from './env';
import { startHeartbeat } from './heartbeat';
import { DEFAULT_REPLAY_DIR } from './replay/store';
import { pollOnce, type Worker } from './runner';
import { startScheduler } from './scheduler';
import { serviceClient } from './supabase';

const IDLE_POLL_MS = 1_000;

function start(): { worker: Worker; stop: () => void } {
  const env = parseAgentEnv(process.env);
  const mode = assertStartAllowed(env);
  const host = hostname();
  // Per process, so two workers on one host never share a lock owner, a heartbeat row or a config dir.
  const workerId = randomUUID();
  const db = serviceClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, workerId);
  const home = env.ESTA_AGENT_HOME ?? join(tmpdir(), 'esta-agent');
  const configDir = join(home, `config-${workerId}`);
  mkdirSync(configDir, { recursive: true });
  const clock = () => readClock(db, env);
  const worker: Worker = {
    db,
    workerId,
    mode,
    jobsDir: join(home, 'jobs'),
    configDir,
    replayDir: env.ESTA_REPLAY_DIR ?? DEFAULT_REPLAY_DIR,
    timezone: env.ESTA_TIMEZONE,
    clock,
  };
  const stopHeartbeat = startHeartbeat(
    db,
    { worker_id: workerId, host_label: host, version: agentPackage.version, auth_mode: mode.authMode, agent_mode: mode.agentMode },
    clock,
    (error) => console.error(`[agent] heartbeat: ${error instanceof Error ? error.message : String(error)}`),
  );
  const stopScheduler =
    env.ESTA_AGENT_SCHEDULE === 'on'
      ? startScheduler(db, env.ESTA_TIMEZONE, clock, (error) => console.error(`[agent] scheduler: ${error instanceof Error ? error.message : String(error)}`))
      : () => undefined;
  console.log(`[agent] worker ${workerId} started: agent mode ${mode.agentMode}, auth mode ${mode.authMode}`);
  return {
    worker,
    stop: () => {
      stopHeartbeat();
      stopScheduler();
    },
  };
}

let started: ReturnType<typeof start>;
try {
  started = start();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    stopping = true;
    started.stop();
  });
}

while (!stopping) {
  const ran = await pollOnce(started.worker).catch((error: unknown) => {
    console.error(`[agent] ${error instanceof Error ? error.message : String(error)}`);
    return false;
  });
  if (!ran && !stopping) await sleep(IDLE_POLL_MS);
}
rmSync(started.worker.configDir, { recursive: true, force: true });
process.exit(0);
