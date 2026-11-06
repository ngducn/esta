import { readFileSync } from 'node:fs';
import { parseEnv as parseEnvFile } from 'node:util';
import { z } from 'zod';
import { parseAgentEnv } from '../apps/agent/src/env.ts';
import { parseEnv as parseWebEnv } from '../apps/web/src/server/env-schema.ts';

export const TARGETS = ['preview', 'production'] as const;
export type Target = (typeof TARGETS)[number];

type Source = Readonly<Record<string, string | undefined>>;

function messages(error: unknown): string[] {
  if (error instanceof z.ZodError) return error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  return [error instanceof Error ? error.message : String(error)];
}

function attempt(run: () => unknown): string[] {
  try {
    run();
    return [];
  } catch (error) {
    return messages(error);
  }
}

function leakedServiceKeys(source: Source): string[] {
  const key = source.SUPABASE_SERVICE_ROLE_KEY;
  return Object.entries(source).flatMap(([name, value]) => {
    if (!name.startsWith('NEXT_PUBLIC_')) return [];
    const holdsKey = key !== undefined && key !== '' && value === key;
    return holdsKey || /SERVICE_ROLE/i.test(name) ? [`${name}: a service role key must never reach the browser`] : [];
  });
}

export function checkEnv(target: Target, source: Source): string[] {
  const problems = [
    ...attempt(() => parseWebEnv({ ...source, NODE_ENV: 'production' })),
    ...attempt(() => parseAgentEnv(source)),
    ...leakedServiceKeys(source),
  ];
  if (source.ESTA_ENV !== target) problems.push(`ESTA_ENV: must be ${target} for this target, got ${source.ESTA_ENV ?? 'unset'}`);
  if (target === 'production' && source.ESTA_FROZEN_NOW !== undefined && source.ESTA_FROZEN_NOW !== '') problems.push('ESTA_FROZEN_NOW: a frozen clock must not be set in production');
  if (target === 'production' && source.ESTA_AGENT_MODE === 'replay') problems.push('ESTA_AGENT_MODE: replay answers from recordings and must not run in production');
  return [...new Set(problems)];
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const targetIndex = args.indexOf('--target');
  const target = TARGETS.find((name) => name === args[targetIndex + 1]);
  const file = args.filter((_, index) => index !== targetIndex && index !== targetIndex + 1)[0];
  if (targetIndex === -1 || target === undefined || file === undefined) {
    console.error(`Usage: node scripts/check-env.ts --target <${TARGETS.join('|')}> <env file>`);
    process.exit(2);
  }
  const problems = checkEnv(target, parseEnvFile(readFileSync(file, 'utf8')));
  if (problems.length > 0) {
    console.error(`${file} is not ready for ${target}:\n${problems.map((problem) => `- ${problem}`).join('\n')}`);
    process.exit(1);
  }
  console.log(`env ok for ${target}`);
}
