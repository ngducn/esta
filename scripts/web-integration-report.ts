import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { z } from 'zod';

const reportSchema = z.object({
  testResults: z.array(
    z.object({
      name: z.string(),
      status: z.string(),
      message: z.string().default(''),
      assertionResults: z.array(z.object({ fullName: z.string(), status: z.string(), failureMessages: z.array(z.string()).default([]) })),
    }),
  ),
});

export type VitestReport = z.infer<typeof reportSchema>;

export const parseReport = (json: string): VitestReport => reportSchema.parse(JSON.parse(json));

/** The local Supabase gateway answering while its upstream restarts or is busy (#310). Anything else is a real failure. */
export const GATEWAY_ERROR = /An invalid response was received from the upstream server/;

const SKIPPED = new Set(['skipped', 'pending', 'todo']);

/** Tests the run skipped. A database-backed test that skips while the stack is up proves nothing and must fail the job (#122). */
export function skippedTests(report: VitestReport): string[] {
  return report.testResults.flatMap((file) => file.assertionResults.filter((test) => SKIPPED.has(test.status)).map((test) => `${file.name}: ${test.fullName}`));
}

/**
 * The files to run once more when every failure in the report is the gateway error, and `undefined` when any failure is
 * something else: one real failure beside a gateway error must not be retried into a pass.
 */
export function gatewayRetryFiles(report: VitestReport, webRoot: string): string[] | undefined {
  const files: string[] = [];
  for (const file of report.testResults) {
    const failures = [...file.assertionResults.filter((test) => test.status === 'failed').flatMap((test) => test.failureMessages), ...(file.status === 'failed' && file.assertionResults.every((test) => test.status !== 'failed') ? [file.message] : [])];
    if (failures.length === 0) continue;
    if (!failures.every((message) => GATEWAY_ERROR.test(message))) return undefined;
    files.push(relative(webRoot, file.name).split(sep).join('/'));
  }
  return files.length > 0 ? files : undefined;
}

const STACK_IMPORT = /from\s+['"]@\/test\/stack['"]/;

/**
 * The unit-style test files of apps/web that need the seeded stack because they import `@/test/stack`, found by that import
 * so a new one is run against the stack in CI without being listed anywhere. Paths are relative to apps/web.
 */
export function stackTestFiles(webRoot: string): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.test\.tsx?$/.test(entry.name) && !entry.name.includes('.integration.') && STACK_IMPORT.test(readFileSync(path, 'utf8'))) {
        found.push(relative(webRoot, path).split(sep).join('/'));
      }
    }
  };
  walk(join(webRoot, 'src'));
  return found.sort();
}
