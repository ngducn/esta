import { readFileSync } from 'node:fs';
import { parseEnv as parseEnvFile } from 'node:util';
import { z } from 'zod';
import { assertStartAllowed, parseAgentEnv } from '../apps/agent/src/env.ts';
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

export const APPS = ['web', 'agent'] as const;
export type App = (typeof APPS)[number];

function jwtRole(value: string): unknown {
  const payload = value.split('.')[1];
  if (payload === undefined) return undefined;
  try {
    return (JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { role?: unknown }).role;
  } catch {
    return undefined;
  }
}

/** The anon and service role keys sit side by side on the Supabase dashboard, so a swap is the realistic mistake: look at what the value is, not only its name. */
function leakedServiceKeys(source: Source): string[] {
  const key = source.SUPABASE_SERVICE_ROLE_KEY;
  return Object.entries(source).flatMap(([name, value]) => {
    if (!name.startsWith('NEXT_PUBLIC_')) return [];
    const holdsKey = key !== undefined && key !== '' && value === key;
    const secret = value !== undefined && (value.startsWith('sb_secret_') || jwtRole(value) === 'service_role');
    return holdsKey || secret || /SERVICE_ROLE/i.test(name) ? [`${name}: a service role key must never reach the browser`] : [];
  });
}

function checkAgent(target: Target, source: Source): string[] {
  let problems: string[];
  try {
    const env = parseAgentEnv(source);
    problems = attempt(() => assertStartAllowed(env));
  } catch (error) {
    problems = messages(error);
  }
  if (target === 'production' && (source.ESTA_BACKUP_DIR === undefined || source.ESTA_BACKUP_DIR.trim() === '')) {
    problems.push('ESTA_BACKUP_DIR: production has no default folder, so the nightly backup would refuse to run');
  }
  if (target === 'production' && source.ESTA_AGENT_MODE === 'replay') problems.push('ESTA_AGENT_MODE: replay answers from recordings and must not run in production');
  return problems;
}

export function checkEnv(target: Target, source: Source, app: App): string[] {
  const problems = [...(app === 'web' ? [...attempt(() => parseWebEnv({ ...source, NODE_ENV: 'production' })), ...leakedServiceKeys(source)] : checkAgent(target, source))];
  if (source.ESTA_ENV !== target) problems.push(`ESTA_ENV: must be ${target} for this target, got ${source.ESTA_ENV ?? 'unset'}`);
  if (target === 'production' && source.ESTA_FROZEN_NOW !== undefined && source.ESTA_FROZEN_NOW !== '') problems.push('ESTA_FROZEN_NOW: a frozen clock must not be set in production');
  return [...new Set(problems)];
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const targetIndex = args.indexOf('--target');
  const appIndex = args.indexOf('--app');
  const target = TARGETS.find((name) => name === args[targetIndex + 1]);
  const app = APPS.find((name) => name === args[appIndex + 1]);
  const file = args.filter((_, index) => ![targetIndex, targetIndex + 1, appIndex, appIndex + 1].includes(index))[0];
  if (targetIndex === -1 || appIndex === -1 || target === undefined || app === undefined || file === undefined) {
    console.error(`Usage: node scripts/check-env.ts --target <${TARGETS.join('|')}> --app <${APPS.join('|')}> <env file>`);
    process.exit(2);
  }
  const problems = checkEnv(target, parseEnvFile(readFileSync(file, 'utf8')), app);
  if (problems.length > 0) {
    console.error(`${file} is not ready for ${target} (${app}):\n${problems.map((problem) => `- ${problem}`).join('\n')}`);
    process.exit(1);
  }
  console.log(`env ok for ${target} (${app})`);
}
