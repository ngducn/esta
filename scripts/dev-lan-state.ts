import { spawnSync } from 'node:child_process';

export type State = { pid: number; lan: string };

export type CommandOf = (pid: number) => string | undefined;

export function commandOf(pid: number): string | undefined {
  const result = spawnSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : undefined;
}

function parseState(raw: string): State | undefined {
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return undefined;
    const { pid, lan } = value as Record<string, unknown>;
    return Number.isSafeInteger(pid) && typeof lan === 'string' ? { pid: pid as number, lan } : undefined;
  } catch {
    return undefined;
  }
}

export function liveState(raw: string | undefined, command: CommandOf): State | undefined {
  const state = raw === undefined ? undefined : parseState(raw);
  if (state === undefined) return undefined;
  return command(state.pid)?.includes('scripts/dev-lan.ts') ? state : undefined;
}
