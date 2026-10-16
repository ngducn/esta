import type { Json } from '@esta/db';
import type { EstaToolName } from '../tools/server';
import { PING_PROMPT, pingResult } from './ping';

export type ModelRole = 'routine' | 'deep';

export type JobSpec = {
  readonly kind: string;
  /** Claude Code built-in tools the SDK may offer; `[]` offers none (S1 correction 2). */
  readonly builtInTools: readonly string[];
  readonly mcpTools: readonly EstaToolName[];
  readonly maxTurns: number;
  readonly timeoutMs: number;
  readonly modelRole: ModelRole;
  readonly handler: {
    prompt(payload: unknown): string;
    result(reply: string): Json;
  };
};

/** Timeouts mirror `private.agent_job_timeout` in SQL, which reclaims a crashed worker's job (AGENT.md §3). */
export const JOBS = {
  ping: {
    kind: 'ping',
    builtInTools: [],
    mcpTools: ['household_info'],
    maxTurns: 3,
    timeoutMs: 60_000,
    modelRole: 'routine',
    handler: { prompt: () => PING_PROMPT, result: pingResult },
  },
} as const satisfies Record<string, JobSpec>;

export function jobSpec(kind: string): JobSpec | undefined {
  return Object.hasOwn(JOBS, kind) ? JOBS[kind as keyof typeof JOBS] : undefined;
}
