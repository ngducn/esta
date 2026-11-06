import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');
const scripts = (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { scripts: Record<string, string> }).scripts;

const NOT_IN_CHECK: Record<string, string> = {
  'check-env.ts': 'reads a running environment, so it runs from `pnpm check:env` before a start, not from `pnpm check`',
};

const NOT_IN_A_SCRIPT: Record<string, string> = {
  'completeness-fixture.ts': 'regenerates the committed completeness seed facts by hand (esta-v1-plan.md)',
  'export-household.ts': 'run as `pnpm exec tsx scripts/export-household.ts` by CI and tools/ci-local.sh (CLAUDE.md)',
  'function-size.ts': 'a one-off spike measurement of the receipt route (S7)',
  'roundtrip-checks.ts': 'run directly by CI and tools/ci-local.sh',
  'seed-bulk-properties.ts': 'loads the bulk-property e2e data, run directly (supabase/seed/README.md)',
};

function reachableFrom(name: string, seen = new Set<string>()): Set<string> {
  if (seen.has(name)) return seen;
  seen.add(name);
  for (const match of (scripts[name] ?? '').matchAll(/\bpnpm (?:run )?([\w:.-]+)/g)) reachableFrom(match[1] ?? '', seen);
  return seen;
}

const sources = (): string[] => readdirSync(join(root, 'scripts')).filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'));

describe('package.json scripts', () => {
  it('runs every scripts/check-*.ts gate from `pnpm check`', () => {
    const commands = [...reachableFrom('check')].map((name) => scripts[name] ?? '').join('\n');
    const missing = sources().filter((file) => file.startsWith('check-') && !commands.includes(`scripts/${file}`) && !(file in NOT_IN_CHECK));
    expect(missing, 'a gate that no longer runs looks like a green check').toEqual([]);
  });

  it('keeps no allowlist entry for a gate that now runs or a file that is gone', () => {
    const commands = [...reachableFrom('check')].map((name) => scripts[name] ?? '').join('\n');
    const files = sources();
    const stale = Object.keys(NOT_IN_CHECK).filter((file) => commands.includes(`scripts/${file}`) || !files.includes(file));
    expect(stale).toEqual([]);
  });

  it('gives every scripts/*.ts entry point a package.json script', () => {
    const tracked = execFileSync('git', ['ls-files', '*.ts', '*.tsx', '*.mjs', '*.mts'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
    const manifests = execFileSync('git', ['ls-files', '**/package.json', 'package.json'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
    const text = (file: string): string => readFileSync(join(root, file), 'utf8');
    const referenced = manifests.map(text).join('\n');
    const importers = tracked.filter((file) => !file.startsWith('scripts/quality/baseline')).map((file) => ({ file, body: text(file) }));
    const orphans = sources().filter((file) => {
      if (referenced.includes(`scripts/${file}`) || file in NOT_IN_A_SCRIPT) return false;
      const stem = file.replace(/\.ts$/, '');
      const importedBy = importers.some(({ file: other, body }) => other !== `scripts/${file}` && new RegExp(`from '[^']*/${stem}(?:\\.ts)?'`).test(body));
      return !importedBy;
    });
    expect(orphans, 'an entry point nothing runs: add its package.json script or delete it').toEqual([]);
  });
});
