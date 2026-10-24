import type { Clock } from '@esta/core';
import { DEFAULT_REPLAY_DIR } from '../src/replay/store';
import type { Worker } from '../src/runner';
import type { AgentDb } from '../src/supabase';
import { clock as extractClock } from './extract-job';

type JobRow = Record<string, unknown>;

/**
 * A replay worker on the fake client. Its claims hand out a copy of the first claimable row, locked by this worker, as
 * `claim_agent_job` and `claim_abandoned_agent_job` do: a queued row whose `run_after` has come, with the claim counted
 * in `attempts`, or a row running under the worker `stopped`, which counts as abandoned.
 */
export function replayWorker(db: AgentDb, jobs: JobRow[], jobsDir: string, clock: () => Promise<Clock> = extractClock): Worker {
  const rpc = async (name: string, args: { worker_id: string; p_as_of: string }) => {
    const abandoned = name === 'claim_abandoned_agent_job';
    const due = (row: JobRow) => typeof row.run_after !== 'string' || Date.parse(row.run_after) <= Date.parse(args.p_as_of);
    const row = jobs.find((candidate) => (abandoned ? candidate.status === 'running' && candidate.locked_by === 'stopped' : candidate.status === 'queued' && due(candidate)));
    if (row !== undefined) Object.assign(row, { status: 'running', locked_by: args.worker_id, locked_at: args.p_as_of, attempts: Number(row.attempts ?? 0) + (abandoned ? 0 : 1) });
    return { data: row === undefined ? [] : [{ ...row }], error: null };
  };
  return { db: Object.assign(db, { rpc }), workerId: 'w2', mode: { agentMode: 'replay', authMode: 'none' }, jobsDir, configDir: jobsDir, replayDir: DEFAULT_REPLAY_DIR, timezone: 'Asia/Ho_Chi_Minh', clock } as unknown as Worker;
}
