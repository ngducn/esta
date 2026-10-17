import { spawnSync } from 'node:child_process';
import { closeSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

export type Outcome = { readonly pass: boolean; readonly detail: string };

export type PhaseCheck =
  | { readonly id: string; readonly commands: readonly (readonly string[])[] }
  | { readonly id: string; readonly verify: (repoRoot: string) => Outcome };

/** The redacted record of one live ping: no token, no session id, so any other key fails the parse. */
const pingRunRecord = z
  .object({
    source: z.string(),
    job: z.literal('ping'),
    auth_mode: z.string(),
    agent_mode: z.string(),
    model: z.string(),
    num_turns: z.number().int().positive(),
    cost_estimate_usd: z.number().nonnegative(),
    tool_calls: z.record(z.string(), z.number().int().nonnegative()),
  })
  .strict();

export const S1_RECORD = 'docs/plan/trail/phase-0/s1-ping-run.json';

export function verifyPingRecord(text: string): Outcome {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { pass: false, detail: `${S1_RECORD} is not JSON` };
  }
  const parsed = pingRunRecord.safeParse(json);
  if (!parsed.success) return { pass: false, detail: `${S1_RECORD}: ${parsed.error.issues.map((issue) => `${issue.path.join('.') || 'record'} ${issue.message}`).join('; ')}` };
  const { auth_mode, agent_mode, tool_calls } = parsed.data;
  const calls = tool_calls['mcp__esta__household_info'] ?? 0;
  const pass = auth_mode === 'subscription' && agent_mode === 'live' && calls === 1;
  return { pass, detail: `auth ${auth_mode}, agent ${agent_mode}, household_info × ${calls}` };
}

const e2e = (spec: string) => ['pnpm', 'e2e', spec];
const core = (...tests: string[]) => ['pnpm', '--filter', '@esta/core', 'exec', 'vitest', 'run', ...tests];
const web = (...tests: string[]) => ['pnpm', '--filter', '@esta/web', 'exec', 'vitest', 'run', '--exclude', '**/*.live.test.ts', ...tests];
const pgtap = (...tests: string[]) => ['pnpm', 'db:test', ...tests.map((name) => `supabase/tests/${name}.test.sql`)];

/** Each phase-final PR adds its phase's rows. */
export const PHASE_CHECKS: Readonly<Record<string, readonly PhaseCheck[]>> = {
  '0': [
    { id: 'FND-1', commands: [e2e('e2e/auth.spec.ts')] },
    { id: 'FND-2', commands: [['pnpm', 'db:test']] },
    { id: 'FND-3', commands: [['pnpm', 'lint'], ['pnpm', 'i18n:parity']] },
    { id: 'FND-4', commands: [['pnpm', '--filter', '@esta/core', 'test']] },
    { id: 'FND-5', commands: [['pnpm', 'glyphs:check'], ['pnpm', 'contrast:check'], e2e('e2e/dev-components.spec.ts')] },
    { id: 'FND-6', commands: [['pnpm', 'db:test', 'supabase/tests/reference_data.test.sql', 'supabase/tests/suggest_current_unit.test.sql']] },
    // Resets the database twice, so the e2e rows after it start from the full seed.
    { id: 'FND-7', commands: [['pnpm', 'db:seed:check']] },
    { id: 'FND-9', commands: [e2e('e2e/fnd9-integration.spec.ts')] },
    { id: 'S1', verify: (repoRoot) => verifyPingRecord(readFileSync(join(repoRoot, S1_RECORD), 'utf8')) },
  ],
  // PRP-7 moved to P2-08. The e2e rows need the slot's web server, as `pnpm e2e` does; Lighthouse starts its own build.
  '1': [
    {
      id: 'PRP-1',
      commands: [core('src/properties/form-fields.test.ts', 'src/schemas/property.test.ts', 'src/properties/units.test.ts'), e2e('e2e/property-form.spec.ts'), e2e('e2e/property-units.spec.ts')],
    },
    { id: 'PRP-2', commands: [core('src/properties/area.test.ts', 'src/schemas/legal.test.ts'), pgtap('property_legal'), e2e('e2e/property-legal.spec.ts')] },
    {
      id: 'PRP-3',
      commands: [
        core('src/properties/ownership.test.ts', 'src/schemas/ownership.test.ts', 'src/completeness/score.test.ts'),
        pgtap('ownership_shares', 'completeness_facts'),
        e2e('e2e/property-owners.spec.ts'),
      ],
    },
    { id: 'PRP-4', commands: [core('src/address/format-current.test.ts'), pgtap('suggest_current_unit'), e2e('e2e/property-form.spec.ts')] },
    { id: 'PRP-5', commands: [core('src/maps'), web('src/server/maps'), e2e('e2e/properties-map.spec.ts')] },
    { id: 'PRP-6', commands: [core('src/completeness'), pgtap('completeness_facts'), e2e('e2e/property-completeness.spec.ts')] },
    { id: 'PRP-8', commands: [core('src/properties/filters.test.ts'), pgtap('property_list'), e2e('e2e/properties-list.spec.ts'), e2e('e2e/property-completeness.spec.ts')] },
    // Every public table has RLS and a pgTAP file naming it, which `pnpm db:test` checks after the tests.
    { id: 'RLS', commands: [['pnpm', 'db:test']] },
    { id: 'Lighthouse', commands: [['node', 'scripts/perf/phase-budget.ts']] },
  ],
};

export type RunCommand = (command: readonly string[], log: string) => number;

const runCommand: RunCommand = ([program = '', ...args], log) => {
  const fd = openSync(log, 'a');
  try {
    const result = spawnSync(program, args, { stdio: ['ignore', fd, fd] });
    return result.error === undefined ? (result.status ?? 1) : 1;
  } finally {
    closeSync(fd);
  }
};

export type PhaseOptions = {
  readonly repoRoot: string;
  readonly checks?: Readonly<Record<string, readonly PhaseCheck[]>>;
  readonly run?: RunCommand;
  readonly print?: (line: string) => void;
  readonly logDir?: string;
};

/** Prints one PASS or FAIL row per id and returns the exit code: 0 when every row passes, 1 on any FAIL, 2 for an unknown phase. */
export function checkPhase(phase: string, { repoRoot, checks = PHASE_CHECKS, run = runCommand, print = console.log, logDir }: PhaseOptions): number {
  const rows = checks[phase];
  if (rows === undefined) {
    print(`Unknown phase "${phase}". Known phases: ${Object.keys(checks).join(', ')}.`);
    return 2;
  }
  const logs = logDir ?? join(tmpdir(), `esta-phase-${phase}`);
  mkdirSync(logs, { recursive: true });
  let failed = 0;
  for (const check of rows) {
    const started = performance.now();
    let outcome: Outcome;
    if ('verify' in check) {
      try {
        outcome = check.verify(repoRoot);
      } catch (error) {
        outcome = { pass: false, detail: error instanceof Error ? error.message : String(error) };
      }
    } else {
      const log = join(logs, `${check.id}.log`);
      writeFileSync(log, '');
      const failedCommand = check.commands.find((command) => run(command, log) !== 0);
      outcome = { pass: failedCommand === undefined, detail: failedCommand === undefined ? log : `${failedCommand.join(' ')} failed, log ${log}` };
    }
    const seconds = Math.round((performance.now() - started) / 1000);
    print(`${outcome.pass ? 'PASS' : 'FAIL'}  ${check.id.padEnd(6)} ${String(seconds).padStart(4)} s  ${outcome.detail}`);
    if (!outcome.pass) failed++;
  }
  return failed === 0 ? 0 : 1;
}

if (import.meta.main) {
  const [phase] = process.argv.slice(2);
  if (phase === undefined) {
    console.error('Usage: pnpm phase:check <phase>');
    process.exit(2);
  }
  process.exit(checkPhase(phase, { repoRoot: join(import.meta.dirname, '..') }));
}
