import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';

const stepSchema = z.looseObject({
  name: z.string().optional(),
  uses: z.string().optional(),
  run: z.string().optional(),
  with: z.record(z.string(), z.unknown()).optional(),
});
const workflowSchema = z.looseObject({
  on: z.union([z.string(), z.array(z.string()), z.record(z.string(), z.unknown())]),
  permissions: z.record(z.string(), z.string()).optional(),
  jobs: z.record(z.string(), z.looseObject({ steps: z.array(stepSchema).default([]) })),
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
