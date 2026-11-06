import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';

const stepSchema = z.looseObject({
  name: z.string().optional(),
  uses: z.string().optional(),
  run: z.string().optional(),
  with: z.record(z.string(), z.unknown()).optional(),
  env: z.record(z.string(), z.unknown()).optional(),
});
const workflowSchema = z.looseObject({
  on: z.union([z.string(), z.array(z.string()), z.record(z.string(), z.unknown())]),
  permissions: z.record(z.string(), z.string()).optional(),
  jobs: z.record(z.string(), z.looseObject({ steps: z.array(stepSchema).default([]), needs: z.union([z.string(), z.array(z.string())]).optional(), if: z.union([z.string(), z.boolean()]).optional() })),
});

export type Workflow = z.infer<typeof workflowSchema>;
type Step = z.infer<typeof stepSchema>;

export const parseWorkflow = (text: string): Workflow => workflowSchema.parse(parse(text));

const FULL_SHA = /^[^@\s]+@[0-9a-f]{40}$/;
const JOB_SCRIPT = /tools\/ci\/jobs\/[\w-]+\.sh/g;
const HELPER_SCRIPT = /^tools\/ci\/(?!jobs\/)[\w.-]+\.(sh|mjs)\b/;

/** The job that only reads the other jobs' results; it has no project work to share with the local CI. */
const AGGREGATE_JOB = 'ci';

const eventNames = (on: Workflow['on']): string[] => (typeof on === 'string' ? [on] : Array.isArray(on) ? on : Object.keys(on));

/**
 * What CLAUDE.md "CI" promises of ci.yml: pull requests test the merge result, every action is pinned by a full SHA, the
 * token is read-only, there is no `pull_request_target` and no secret.
 */
export function securityProblems(workflow: Workflow, text: string): string[] {
  const problems: string[] = [];
  const events = eventNames(workflow.on);
  if (!events.includes('pull_request')) problems.push('the workflow does not run on pull_request');
  if (events.includes('pull_request_target') || /pull_request_target/.test(text)) problems.push('the workflow mentions pull_request_target');
  if (workflow.permissions?.contents !== 'read' || Object.keys(workflow.permissions).length !== 1) problems.push('the token is not read-only (permissions must be contents: read alone)');
  if (/\bsecrets\./.test(text)) problems.push('the workflow reads a secret');
  for (const [job, { steps }] of Object.entries(workflow.jobs)) {
    for (const step of steps) {
      if (step.uses !== undefined && !step.uses.startsWith('./') && !FULL_SHA.test(step.uses)) problems.push(`${job}: ${step.uses} is not pinned by a 40-character SHA`);
      if (step.uses?.startsWith('actions/checkout@') && step.with?.['ref'] !== undefined) {
        problems.push(`${job}: checkout pins ref ${JSON.stringify(step.with['ref'])}, so a pull request would test its head and not the merge result`);
      }
    }
  }
  return problems;
}

const hasProjectWork = (step: Step) => step.run !== undefined && !HELPER_SCRIPT.test(step.run.trim());

/** A run step must call a tools/ci/jobs script (the same one tools/ci-local.sh runs) or be a single call of another tools/ci helper. */
export function jobScriptProblems(workflow: Workflow): string[] {
  const problems: string[] = [];
  for (const [job, { steps }] of Object.entries(workflow.jobs)) {
    if (job === AGGREGATE_JOB) continue;
    for (const step of steps) {
      if (!hasProjectWork(step)) continue;
      if (!step.run?.match(JOB_SCRIPT)) problems.push(`${job}: the run step ${JSON.stringify((step.run ?? '').trim().split('\n')[0])} does project work without calling a tools/ci/jobs script`);
    }
  }
  return problems;
}

/** Every job script a workflow calls. */
export function calledJobScripts(workflow: Workflow): string[] {
  return [...new Set(Object.values(workflow.jobs).flatMap(({ steps }) => steps.flatMap((step) => step.run?.match(JOB_SCRIPT) ?? [])))].sort();
}

export const jobScriptsOnDisk = (root: string): string[] =>
  readdirSync(join(root, 'tools', 'ci', 'jobs'))
    .filter((name) => name.endsWith('.sh'))
    .map((name) => `tools/ci/jobs/${name}`)
    .sort();

/** The job scripts a local CI script mentions by path. */
export const scriptsCalledBy = (shell: string): string[] => [...new Set(shell.match(JOB_SCRIPT) ?? [])].sort();

type Scenario = { event: string; draft: boolean };
const FULL_RUN = ['check', 'db', 'e2e', 'e2e-report', 'prod-build', 'design', 'mutation', 'ci'];
/** What each kind of run must start, by CLAUDE.md "CI": a draft saves the heavy jobs, a push to main repeats a tested result. */
const EXPECTED_RUNS: Array<Scenario & { jobs: string[] }> = [
  { event: 'pull_request', draft: true, jobs: ['check', 'design'] },
  { event: 'pull_request', draft: false, jobs: FULL_RUN },
  { event: 'push', draft: false, jobs: ['check', 'db', 'prod-build', 'design', 'ci'] },
  { event: 'schedule', draft: false, jobs: FULL_RUN },
  { event: 'workflow_dispatch', draft: false, jobs: FULL_RUN },
];

/** Evaluates a `${{ }}` expression over the github context, the way Actions does for the operators ci.yml uses. */
function evaluate(value: unknown, { event, draft }: Scenario): unknown {
  if (typeof value !== 'string') return value;
  const match = value.trim().match(/^\$\{\{([\s\S]*)\}\}$/);
  if (!match) return value;
  const github = { event_name: event, event: { pull_request: event === 'pull_request' ? { draft } : undefined }, ref: 'refs/heads/main', run_id: '1' };
  const run = new Function('github', 'always', 'cancelled', `return (${match[1]});`) as (...args: unknown[]) => unknown;
  return run(github, () => true, () => false);
}

const statusFunction = /\b(always|cancelled|failure)\(/;

/** The jobs a run of this kind starts, in the order Actions would decide them. */
export function jobsThatRun(workflow: Workflow, scenario: Scenario): string[] {
  const ran = new Set<string>();
  const decided = new Set<string>();
  const decide = (name: string): void => {
    if (decided.has(name)) return;
    decided.add(name);
    const job = workflow.jobs[name];
    if (!job) return;
    const needs = typeof job.needs === 'string' ? [job.needs] : (job.needs ?? []);
    needs.forEach(decide);
    const condition = job.if;
    const overridesStatus = typeof condition === 'string' && statusFunction.test(condition);
    if (!overridesStatus && !needs.every((need) => ran.has(need))) return;
    if (condition === undefined || evaluate(condition, scenario)) ran.add(name);
  };
  Object.keys(workflow.jobs).forEach(decide);
  return [...ran].sort();
}

/** Which jobs run on a draft, a ready pull request, a push to main, the nightly run and a manual run; whether `ci` can pass around a skipped job. */
export function runShapeProblems(workflow: Workflow): string[] {
  const problems: string[] = [];
  const on = workflow.on;
  const triggers = typeof on === 'object' && !Array.isArray(on) ? on : {};
  const pullRequest = triggers['pull_request'] as { types?: string[] } | null | undefined;
  if (!pullRequest?.types?.includes('ready_for_review')) problems.push('pull_request does not list ready_for_review, so marking a draft ready would not start the full run');
  for (const type of ['opened', 'synchronize', 'reopened']) if (!pullRequest?.types?.includes(type)) problems.push(`pull_request types lack ${type}`);
  if (!('schedule' in triggers)) problems.push('the workflow has no schedule for the nightly full run');
  if (!('workflow_dispatch' in triggers)) problems.push('the workflow has no workflow_dispatch');
  for (const scenario of EXPECTED_RUNS) {
    const label = scenario.draft ? 'a draft pull request' : scenario.event;
    const actual = jobsThatRun(workflow, scenario);
    const expected = [...scenario.jobs].sort();
    // On a draft `ci` must be skipped; on every other run it must run.
    for (const name of actual.filter((job) => !expected.includes(job))) problems.push(`${label} runs ${name}, which it must skip`);
    for (const name of expected.filter((job) => !actual.includes(job))) problems.push(`${label} skips ${name}, which it must run`);
  }
  const allowed = String(evaluate(workflow.jobs['ci']?.steps.find((step) => step.env?.['ALLOWED'] !== undefined)?.env?.['ALLOWED'], { event: 'pull_request', draft: false }) ?? '');
  if (allowed.trim() !== 'success') problems.push(`ci accepts "${allowed}" on a ready pull request; only success may pass`);
  return problems;
}
