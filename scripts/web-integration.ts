// Usage: ESTA_SLOT=<n> node scripts/web-integration.ts [file...]. Runs apps/web's *.integration.test.ts, or the files named
// relative to apps/web, against that slot's stack. Retries the failed files once when the only failure is the local gateway's invalid
// upstream response.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runsAlone } from '../apps/web/src/test/lanes.ts';
import { parseSlot, slotPorts } from './slot.ts';
import { slotEnv } from './slot-env.ts';
import { gatewayRetryFiles, parseReport } from './web-integration-report.ts';

const root = join(import.meta.dirname, '..');
const slot = parseSlot(process.env.ESTA_SLOT);
const env = slotEnv(root, slot);
const AS_OF_INSTANT = '2026-10-07T09:00:00+07:00';
const clock = (target: string) => spawnSync('pnpm', ['clock:set', target], { cwd: root, stdio: 'inherit', env: { ...process.env, ESTA_SLOT: String(slot) } });
if (clock(AS_OF_INSTANT).status !== 0) process.exit(1);
const webRoot = join(root, 'apps', 'web');
const reportDir = mkdtempSync(join(tmpdir(), 'web-integration-'));
let runs = 0;

/** One vitest run whose JSON report lands in reportDir, so a skip or a gateway error can be read afterwards. */
function vitest(filters: readonly string[], extra: readonly string[] = []) {
  const outputFile = join(reportDir, `report-${(runs += 1)}.json`);
  const status =
    spawnSync('pnpm', ['exec', 'vitest', 'run', '--project', 'node', '--reporter=default', '--reporter=json', `--outputFile.json=${outputFile}`, ...extra, ...filters], {
      cwd: webRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        ESTA_SLOT: String(slot),
        ESTA_IT_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL,
        ESTA_IT_ANON_KEY: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        ESTA_IT_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
        ESTA_IT_MAILBOX: `http://127.0.0.1:${slotPorts(slot).inbucket}/api/v1`,
      },
    }).status ?? 1;
  return { status, report: existsSync(outputFile) ? parseReport(readFileSync(outputFile, 'utf8')) : undefined };
}

/** A busy local gateway answers one request with an invalid upstream response (#310); the failed files run once more, and only for that error. */
function runChecked(filters: readonly string[], extra: readonly string[] = []): number {
  let result = vitest(filters, extra);
  if (result.status !== 0 && result.report !== undefined) {
    const retry = gatewayRetryFiles(result.report, webRoot);
    if (retry !== undefined) {
      console.warn(`web-integration: the local gateway answered an invalid upstream response in ${retry.join(', ')}; running those files once more`);
      result = vitest(retry, extra);
    }
  }
  return result.status;
}

const files = process.argv.slice(2);
const status =
  files.length > 0
    ? runChecked(files)
    : runChecked(['integration', ...runsAlone.flatMap((file) => ['--exclude', file])]) ||
      (runsAlone.length > 0 ? runChecked(runsAlone) : 0);
clock('off');
rmSync(reportDir, { recursive: true, force: true });
process.exit(status);
