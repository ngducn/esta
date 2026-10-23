import { spawnSync } from 'node:child_process';
import { closeSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { isIsoDate } from '../packages/core/src/date/iso-date.ts';

export type Outcome = { readonly pass: boolean; readonly detail: string };

export type PhaseCheck =
  | {
      readonly id: string;
      readonly commands: readonly (readonly string[])[];
      /** Test files, from the repo root, that must name `id`; the row fails before running when one does not. */
      readonly cites?: readonly string[];
    }
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

export const STATUS = 'docs/plan/STATUS.md';
export const MOM_TEST = 'docs/plan/mom-test.md';

/** Markdown as a reader sees it: without HTML comments or fenced code, where a record could sit unseen. */
export function shownMarkdown(text: string): string {
  let fence: string | null = null;
  return text
    .replace(/<!--[\s\S]*?(?:-->|$)/g, '')
    .split('\n')
    .filter((line) => {
      const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
      if (marker === undefined) return fence === null;
      if (fence === null) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      return false;
    })
    .join('\n');
}

/** The body of the shown `## <heading>` section, or nothing when the file has no such section. */
export function markdownSection(text: string, heading: string): string {
  const section = shownMarkdown(text)
    .split(/^## /m)
    .slice(1)
    .find((part) => part.slice(0, part.indexOf('\n') === -1 ? undefined : part.indexOf('\n')).trim() === heading);
  return section === undefined ? '' : section.slice(section.indexOf('\n') + 1);
}

const VIETQR_RECORD = '- VietQR gate passed on ';
/** An app's name as typed, in NFC, without the zero-width characters a copy and paste can bring along. */
const appName = (typed: string) => typed.normalize('NFC').replace(/[\u200B-\u200D\u2060\uFEFF]/g, '').trim();
const appKey = (app: string) => app.toLowerCase().replace(/\s+/g, '');
const named = (app: string) => /[\p{L}\p{N}]/u.test(app) && !/[<>]/.test(app);

/**
 * Ryan's one line under `## Decided by Ryan` in STATUS.md once two banking apps have scanned the gate's VietQR and an
 * invoice's (SPEC §10, Phase 3): `- VietQR gate passed on YYYY-MM-DD: <first app>, <second app>.`, a real date from
 * 2026 on and two different apps, named.
 */
export function verifyVietQrScan(text: string): Outcome {
  const records = markdownSection(text, 'Decided by Ryan')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith(VIETQR_RECORD));
  if (records.length === 0) return { pass: false, detail: `waiting for Ryan: no "${VIETQR_RECORD.slice(2).trim()}" line under Decided by Ryan in ${STATUS}` };
  if (records.length > 1) return { pass: false, detail: `${records.length} "${VIETQR_RECORD.slice(2).trim()}" lines under Decided by Ryan in ${STATUS}; keep one` };
  const record = /^- VietQR gate passed on (\S+): ([^,]*), ([^,]*?)\.?$/.exec(records[0] ?? '');
  if (record === null) return { pass: false, detail: `the VietQR line in ${STATUS} names no date and two apps, as "${VIETQR_RECORD}YYYY-MM-DD: <first app>, <second app>."` };
  const [, date = '', first = '', second = ''] = record.map(appName);
  const problems = [
    ...(isIsoDate(date) && Number(date.slice(0, 4)) >= 2026 ? [] : [`${date} is not a date from 2026 on`]),
    ...[first, second].flatMap((app, i) => (named(app) ? [] : [`the ${i === 0 ? 'first' : 'second'} app is not named`])),
    ...(named(first) && appKey(first) === appKey(second) ? ['the two apps are the same'] : []),
  ];
  return problems.length === 0
    ? { pass: true, detail: `${first} and ${second} on ${date}` }
    : { pass: false, detail: `the VietQR line in ${STATUS}: ${problems.join(', ')}` };
}

const MOM_TASKS = 4;
const MOM_LIMIT_SECONDS = 120;
const MOM_ROW = /^\|\s*([1-4])\.[^|]*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|/;

/**
 * Ryan's table under `## Results` in mom-test.md: one row for each of the four SPEC §10.1 tasks, marked `yes`, with a
 * time `m:ss` above 0:00 and under 2:00.
 */
export function verifyMomTest(text: string): Outcome {
  const rows = markdownSection(text, 'Results')
    .split('\n')
    .map((line) => MOM_ROW.exec(line))
    .filter((row) => row !== null);
  const problems: string[] = [];
  for (let task = 1; task <= MOM_TASKS; task++) {
    const own = rows.filter((row) => row[1] === String(task));
    const [row] = own;
    const time = /^(\d+):([0-5]\d)$/.exec(row?.[2] ?? '');
    const seconds = time === null ? undefined : Number(time[1]) * 60 + Number(time[2]);
    if (row === undefined) problems.push(`task ${task} has no row`);
    else if (own.length > 1) problems.push(`task ${task} has ${own.length} rows`);
    else if (seconds === undefined) problems.push(`task ${task} has no time`);
    else if (seconds <= 0 || seconds >= MOM_LIMIT_SECONDS) problems.push(`task ${task} took ${row[2]}`);
    else if (row[3]?.toLowerCase() !== 'yes') problems.push(`task ${task} is not marked passed`);
  }
  return problems.length === 0
    ? { pass: true, detail: `${MOM_TASKS} of ${MOM_TASKS} tasks passed in under two minutes` }
    : { pass: false, detail: `waiting for Ryan: ${problems.join(', ')} in ${MOM_TEST}` };
}

/** Local CI's policy: a test that fails gets one retry, and a test that fails twice fails its row. */
const e2e = (spec: string) => ['pnpm', 'e2e', '--retries=1', '--reporter=list', spec];

/** The titles Playwright's list reporter prints under its `N flaky` line: tests that failed once and then passed. */
export function flakyTests(log: string): string[] {
  const lines = log.split('\n');
  const start = lines.findIndex((line) => /^\s+\d+ flaky$/.test(line));
  if (start === -1) return [];
  const titles: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (!/^\s{4}\S/.test(line)) break;
    titles.push(line.trim());
  }
  return titles;
}

type CitedFiles = { core?: readonly string[]; web?: readonly string[]; pgtap?: readonly string[]; e2e?: readonly string[] };

/** An acceptance row runs exactly the tests that cite its id, and checks that each one does. */
function cited(id: string, files: CitedFiles): PhaseCheck {
  const core = (files.core ?? []).map((file) => `src/${file}`);
  const web = (files.web ?? []).map((file) => `src/${file}`);
  const pgtap = (files.pgtap ?? []).map((name) => `supabase/tests/${name}.test.sql`);
  const specs = (files.e2e ?? []).map((name) => `e2e/${name}.spec.ts`);
  return {
    id,
    cites: [...core.map((file) => `packages/core/${file}`), ...web.map((file) => `apps/web/${file}`), ...pgtap, ...specs],
    commands: [
      ...(core.length === 0 ? [] : [['pnpm', '--filter', '@esta/core', 'exec', 'vitest', 'run', ...core]]),
      ...(web.length === 0 ? [] : [['pnpm', '--filter', '@esta/web', 'exec', 'vitest', 'run', ...web]]),
      ...(pgtap.length === 0 ? [] : [['pnpm', 'db:test', ...pgtap]]),
      ...specs.map(e2e),
    ],
  };
}

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
    cited('PRP-1', { core: ['properties/form-fields.test.ts'], e2e: ['property-form', 'property-units'] }),
    cited('PRP-2', { core: ['properties/area.test.ts'], pgtap: ['property_legal'], e2e: ['property-legal'] }),
    cited('PRP-3', {
      core: ['properties/ownership.test.ts', 'completeness/score.test.ts'],
      pgtap: ['ownership_shares', 'completeness_facts'],
      e2e: ['property-owners', 'property-completeness'],
    }),
    cited('PRP-4', { pgtap: ['suggest_current_unit'], e2e: ['property-form'] }),
    cited('PRP-5', { core: ['maps/parse-maps-url.test.ts'], web: ['server/maps/resolve-short-maps-link.test.ts'], e2e: ['properties-map'] }),
    cited('PRP-6', { core: ['completeness/registry.test.ts', 'completeness/score.test.ts'], pgtap: ['completeness_facts'], e2e: ['property-completeness'] }),
    cited('PRP-8', { core: ['properties/filters.test.ts'], pgtap: ['property_list'], e2e: ['properties-list', 'property-units', 'property-completeness'] }),
    // Every public table has RLS and a pgTAP file naming it, which `pnpm db:test` checks after the tests.
    { id: 'RLS', commands: [['pnpm', 'db:test']] },
    { id: 'Lighthouse', commands: [['node', 'scripts/perf/phase-budget.ts']] },
  ],
  // North-star resets the slot to the `northstar` seed, so Lighthouse resets it back to the full seed. Lighthouse goes
  // last because its build empties `.next`, which would take the pages from under a server the e2e rows reuse.
  '2': [
    cited('DOC-1', { e2e: ['documents-upload'] }),
    cited('DOC-2', { web: ['lib/capture/build-pdf.test.ts'], e2e: ['documents-multipage'] }),
    cited('DOC-3', { web: ['server/extraction/actions.test.ts'], pgtap: ['document_search'], e2e: ['documents-vault'] }),
    cited('DOC-4', { web: ['server/documents/actions.test.ts'], e2e: ['documents-upload', 'documents-vault'] }),
    cited('DOC-5', { core: ['documents/categories.test.ts'], e2e: ['documents-upload', 'documents-extract', 'documents-vault'] }),
    cited('DOC-6', { core: ['extraction/acceptance.test.ts'], e2e: ['property-wizard'] }),
    cited('DOC-7', { core: ['documents/expiry.test.ts'], e2e: ['documents-vault'] }),
    cited('PRP-7', {
      web: ['components/property-wizard/wizard-machine.test.ts', 'server/properties/wizard.test.ts'],
      e2e: ['property-wizard'],
    }),
    // The replay golden suite scores every synthetic certificate and bill against AGENT.md §7.2 and fails below a target.
    { id: 'AGT-2', commands: [['pnpm', '--filter', 'agent', 'exec', 'vitest', 'run', 'test/golden/extract.test.ts', 'test/sensitive-documents.test.ts']] },
    { id: 'RLS', commands: [['pnpm', 'db:test']] },
    { id: 'North-star', commands: [['pnpm', 'e2e:northstar', '--retries=1', '--reporter=list']] },
    { id: 'Lighthouse', commands: [['pnpm', 'db:reset'], ['node', 'scripts/perf/phase-budget.ts', '--phase', '2']] },
  ],
  // The integration tests want a fresh full seed, and their cron test moves every household past SPEC §9.3's day, so
  // their row resets first and runs right before north-star, which resets to the `northstar` seed.
  '3': [
    cited('LSE-1', { e2e: ['leases'] }),
    cited('LSE-2', { core: ['lease/state.test.ts', 'lease/changes.test.ts'], pgtap: ['leases', 'lease_changes', 'lease_schedule'], e2e: ['leases', 'lease-detail'] }),
    cited('LSE-3', { pgtap: ['leases', 'lease_schedule', 'lease_changes'], e2e: ['leases'] }),
    cited('LSE-4', { core: ['meters/consumption.test.ts', 'meters/anomaly.test.ts'], pgtap: ['meters'], e2e: ['meters'] }),
    cited('LSE-5', { core: ['vietqr/roundtrip.test.ts'], pgtap: ['invoice_void_issue'], e2e: ['invoices'] }),
    cited('LSE-6', { web: ['server/receipts/pdf.test.ts'], e2e: ['receipts'] }),
    cited('LSE-7', { core: ['allocation/allocate.property.test.ts'], pgtap: ['record_payment', 'deposits'], e2e: ['record-payment'] }),
    cited('LSE-8', { core: ['matching/fixtures.test.ts'], pgtap: ['statement_import'], e2e: ['statement-import', 'statement-mapping'] }),
    cited('LSE-9', { core: ['allocation/deposits.test.ts'], pgtap: ['deposits'], e2e: ['deposits'] }),
    cited('LSE-10', { core: ['collections/group.test.ts', 'properties/status.test.ts'], pgtap: ['collections'], e2e: ['collections'] }),
    cited('LSE-11', { core: ['reminder/templates.test.ts', 'phone/phone.test.ts'], pgtap: ['invoice_share_token'], e2e: ['reminder'] }),
    // The lease prefill from a contract photo (P3-19) brings this spec; the row fails until it merges.
    cited('DOC-6', { e2e: ['lease-from-contract'] }),
    cited('FND-8', { e2e: ['fnd8'] }),
    // Schedule's fast-check samples are pgTAP golden vectors since the database became the one planner (#195).
    { id: 'PBT', commands: [['pnpm', '--filter', '@esta/core', 'exec', 'vitest', 'run', 'src/allocation/allocate.property.test.ts', 'src/matching/match.property.test.ts'], ['pnpm', 'db:test', 'supabase/tests/lease_schedule.test.sql']] },
    { id: 'RLS', commands: [['pnpm', 'db:test']] },
    { id: 'IT', commands: [['pnpm', 'db:reset'], ['node', 'scripts/web-integration.ts']] },
    { id: 'North-star', commands: [['pnpm', 'e2e:northstar', '--retries=1', '--reporter=list']] },
    { id: 'Lighthouse', commands: [['pnpm', 'db:reset'], ['node', 'scripts/perf/phase-budget.ts', '--phase', '3']] },
    { id: 'VietQR', verify: (repoRoot) => verifyVietQrScan(readFileSync(join(repoRoot, STATUS), 'utf8')) },
    { id: 'Mom', verify: (repoRoot) => verifyMomTest(readFileSync(join(repoRoot, MOM_TEST), 'utf8')) },
  ],
};

export function uncited(repoRoot: string, check: PhaseCheck): string[] {
  if (!('cites' in check) || check.cites === undefined) return [];
  const id = new RegExp(`\\b${check.id}\\b`);
  return check.cites.filter((file) => {
    try {
      return !id.test(readFileSync(join(repoRoot, file), 'utf8'));
    } catch {
      return true;
    }
  });
}

const readLog = (path: string) => {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
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
    let log: string | undefined;
    if ('verify' in check) {
      try {
        outcome = check.verify(repoRoot);
      } catch (error) {
        outcome = { pass: false, detail: error instanceof Error ? error.message : String(error) };
      }
    } else if (uncited(repoRoot, check).length > 0) {
      outcome = { pass: false, detail: `${uncited(repoRoot, check).join(', ')} never names ${check.id}` };
    } else {
      const rowLog = join(logs, `${check.id}.log`);
      log = rowLog;
      writeFileSync(rowLog, '');
      const failedCommand = check.commands.find((command) => run(command, rowLog) !== 0);
      outcome = { pass: failedCommand === undefined, detail: failedCommand === undefined ? rowLog : `${failedCommand.join(' ')} failed, log ${rowLog}` };
    }
    const seconds = Math.round((performance.now() - started) / 1000);
    print(`${outcome.pass ? 'PASS' : 'FAIL'}  ${check.id.padEnd(6)} ${String(seconds).padStart(4)} s  ${outcome.detail}`);
    if (log !== undefined) for (const title of flakyTests(readLog(log))) print(`       flaky  ${title}`);
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
