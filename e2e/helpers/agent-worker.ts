import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { join } from 'node:path';
import { e2eServiceHeaders } from '../../scripts/e2e-service.ts';
import { parseSlot } from '../../scripts/slot.ts';
import { slotEnv } from '../../scripts/slot-env.ts';

const repoRoot = join(import.meta.dirname, '..', '..');
const STARTED = /^\[agent\] worker \S+ started/m;
const rest = `${slotEnv(repoRoot, parseSlot(process.env.ESTA_SLOT), { withKeys: false }).NEXT_PUBLIC_SUPABASE_URL}/rest/v1`;

/** Stops the spec's worker and deletes every heartbeat, so the specs after it on the shared clock see no offline banner on every page. */
export async function stopAndForget(worker: AgentWorker | undefined): Promise<void> {
  await worker?.stop();
  const response = await fetch(`${rest}/worker_heartbeats?worker_id=not.is.null`, { method: 'DELETE', headers: e2eServiceHeaders() });
  if (!response.ok) throw new Error(`Deleting the worker heartbeats failed: ${await response.text()}`);
}

export type AgentWorker = { readonly pid: number; running(): boolean; stop(): Promise<void>; exited(): Promise<void>; log(): string };

/**
 * A replay worker on this slot, run in-process by `scripts/agent-dev.ts` so stopping its pid stops the worker.
 * `crashOn` kills it with SIGKILL from the output handler the moment its log matches, as a crash mid-job would.
 * The daily scheduler stays off unless `schedule` is set, so a spec counting its own job rows sees no watch run.
 */
export async function startAgentWorker({ replayDir, home, crashOn, schedule = false }: { replayDir?: string; home?: string; crashOn?: RegExp; schedule?: boolean } = {}): Promise<AgentWorker> {
  const child: ChildProcess = spawn(process.execPath, ['--import', 'tsx', 'scripts/agent-dev.ts'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ESTA_AGENT_MODE: 'replay',
      ESTA_AGENT_SCHEDULE: schedule ? 'on' : 'off',
      ...(replayDir === undefined ? {} : { ESTA_REPLAY_DIR: replayDir }),
      ...(home === undefined ? {} : { ESTA_AGENT_HOME: home }),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const exit = once(child, 'exit').then(() => undefined);
  let output = '';
  const collect = (chunk: Buffer) => {
    output += chunk.toString();
    if (crashOn?.test(output) === true && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  };
  child.stdout?.on('data', collect);
  child.stderr?.on('data', collect);

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`The worker did not start within 30 s:\n${output}`)), 30_000);
    const check = () => {
      if (!STARTED.test(output)) return;
      clearTimeout(timer);
      resolve();
    };
    child.stdout?.on('data', check);
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`The worker exited with ${code}:\n${output}`));
    });
  });

  return {
    pid: child.pid ?? -1,
    running: () => child.exitCode === null && child.signalCode === null,
    log: () => output,
    exited: () => exit,
    async stop() {
      if (child.exitCode !== null || child.signalCode !== null) return;
      child.kill('SIGTERM');
      await exit;
    },
  };
}
