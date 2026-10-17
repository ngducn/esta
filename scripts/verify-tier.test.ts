import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { classify, isBelow, parseAddedText, RULES, type Change, type Tier } from './verify-tier.ts';

const change = (path: string, addedText = ''): Change => ({ path, addedText });

const CASES: readonly { readonly change: Change; readonly tier: Tier }[] = [
  ...[
    'packages/core/src/money/vnd.ts',
    'packages/core/src/allocation/allocate.ts',
    'packages/core/src/tax/position.ts',
    'packages/core/src/vietqr/encode.ts',
    'packages/core/src/schedule/generate.ts',
    'packages/core/src/matching/match.ts',
    'packages/core/src/format/index.ts',
    'packages/core/src/parse/vnd-input.ts',
    'apps/web/src/app/api/cron/keep-alive/route.ts',
    'apps/web/src/server/cron/auth.ts',
    'apps/agent/src/runner.ts',
    'apps/web/src/app/sign-in/actions.ts',
    'apps/web/src/server/member.ts',
    'apps/web/src/server/supabase/session.ts',
    'apps/web/src/proxy.ts',
    'packages/core/src/auth/otp.ts',
    'apps/web/src/server/invite.ts',
    'apps/web/src/app/(app)/settings/roles/page.tsx',
  ].map((path) => ({ change: change(path), tier: 'rigorous' as const })),
  { change: change('apps/web/src/app/onboarding/actions.ts', "await supabase.rpc('claim_invite', { code });"), tier: 'rigorous' },
  { change: change('apps/web/src/app/(app)/page.tsx', 'const role: member_role = member.role;'), tier: 'rigorous' },
  { change: change('supabase/migrations/20261007301000_x.sql', 'grant select on public.invoices to authenticated;'), tier: 'rigorous' },
  { change: change('supabase/migrations/20261007301000_x.sql', 'alter table public.leases add column note text;'), tier: 'standard' },
  { change: change('apps/web/src/app/(app)/properties/page.tsx'), tier: 'standard' },
  { change: change('apps/web/src/components/button.tsx'), tier: 'standard' },
  { change: change('package.json', '    "verify:tier": "node scripts/verify-tier.ts",'), tier: 'lean' },
  { change: change('package.json', '    "zod": "^4.6.5",'), tier: 'standard' },
  { change: change('package.json'), tier: 'standard' },
  { change: change('playwright.config.ts'), tier: 'standard' },
  { change: change('pnpm-lock.yaml'), tier: 'standard' },
  ...[
    'docs/plan/STATUS.md',
    'CLAUDE.md',
    'packages/core/src/tax/README.md',
    'eslint-rules/no-jsx-literals.mjs',
    'eslint.config.mjs',
    'scripts/verify-tier.ts',
    'tools/ci-local.sh',
    'e2e/shell.spec.ts',
    'packages/core/src/tax/position.test.ts',
    'packages/core/src/allocation/allocate.bench.ts',
    'apps/agent/src/runner.test.ts',
    'apps/agent/src/test/fake-db.ts',
    'apps/web/src/test/render.tsx',
    'supabase/tests/properties.test.sql',
    'fixtures/agent-replay/ping/abc.json',
  ].map((path) => ({ change: change(path), tier: 'lean' as const })),
];

const RISKY_SQL = [
  'grant select on public.invoices to authenticated;',
  'REVOKE ALL ON public.invoices FROM anon;',
  'create policy invoices_read on public.invoices for select using (true);',
  'alter policy invoices_read on public.invoices using (true);',
  'drop policy invoices_read on public.invoices;',
  'create function private.claim() returns void language sql security definer as $$ select 1 $$;',
  'delete from public.invoices where paid;',
  'drop table public.invoices;',
  'alter table public.invoices drop column amount;',
  'truncate public.invoices;',
  "insert into storage.buckets (id, name) values ('documents', 'documents');",
  "select private.enable_household_rls('invoices', 'admin');",
  'alter table public.invoices enable row level security;',
];

describe('classify', () => {
  it.each(CASES.map((c) => [c.change.path, c.tier, c.change] as const))('puts %s at %s', (_path, tier, input) => {
    expect(classify([input]).tier).toBe(tier);
  });

  it('has a case for every registry entry', () => {
    const uncovered = RULES.filter((rule) => !CASES.some((c) => rule.match(c.change))).map((rule) => rule.reason);
    expect(uncovered).toEqual([]);
  });

  it.each(RISKY_SQL)('treats a migration adding "%s" as rigorous', (sql) => {
    expect(classify([change('supabase/migrations/20261007301000_x.sql', sql)]).tier).toBe('rigorous');
  });

  it('keeps a plain column or index migration at standard', () => {
    const sql = 'create index leases_unit_idx on public.leases (unit_id);\nalter table public.leases add column note text;';
    expect(classify([change('supabase/migrations/20261007301000_x.sql', sql)]).tier).toBe('standard');
  });

  it('sends a path no rule names to standard, never lean, and says why', () => {
    const result = classify([change('infra/caddy/Caddyfile.template')]);
    expect(result.tier).toBe('standard');
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]).toContain('infra/caddy/Caddyfile.template');
    expect(result.reasons[0]).toContain('no rule');
  });

  it('lets the highest tier win whatever the order of the files', () => {
    const files = [change('docs/plan/STATUS.md'), change('apps/web/src/components/button.tsx'), change('packages/core/src/tax/position.ts')];
    expect(classify(files).tier).toBe('rigorous');
    expect(classify([...files].reverse()).tier).toBe('rigorous');
    expect(classify(files.slice(0, 2)).tier).toBe('standard');
  });

  it('explains only the files that set the tier', () => {
    const { reasons } = classify([change('docs/plan/STATUS.md'), change('packages/core/src/tax/position.ts')]);
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toContain('packages/core/src/tax/position.ts');
    expect(reasons[0]).not.toContain('STATUS.md');
  });

  it('writes one line per reason and groups the files that share it', () => {
    const { reasons } = classify([
      change('packages/core/src/tax/position.ts'),
      change('packages/core/src/tax/rules.ts'),
      change('apps/agent/src/runner.ts'),
    ]);
    expect(reasons).toHaveLength(2);
    expect(reasons.find((line) => line.includes('tax/position.ts'))).toContain('tax/rules.ts');
  });

  it('names three files and counts the rest', () => {
    const files = ['a', 'b', 'c', 'd', 'e'].map((name) => change(`packages/core/src/tax/${name}.ts`));
    const [line] = classify(files).reasons;
    expect(line).toContain('tax/a.ts');
    expect(line).toContain('tax/c.ts');
    expect(line).not.toContain('tax/d.ts');
    expect(line).toContain('2 more');
  });

  it('calls an empty change lean', () => {
    expect(classify([])).toEqual({ tier: 'lean', reasons: ['No files changed.'] });
  });
});

describe('isBelow', () => {
  it('is true only when the declared tier ranks under the computed one', () => {
    expect(isBelow('lean', 'rigorous')).toBe(true);
    expect(isBelow('standard', 'rigorous')).toBe(true);
    expect(isBelow('lean', 'standard')).toBe(true);
    expect(isBelow('rigorous', 'rigorous')).toBe(false);
    expect(isBelow('rigorous', 'lean')).toBe(false);
  });
});

describe('parseAddedText', () => {
  const diff = [
    'diff --git a/docs/a.md b/docs/a.md',
    'index 111..222 100644',
    '--- a/docs/a.md',
    '+++ b/docs/a.md',
    '@@ -1,0 +2 @@',
    '+first added',
    '@@ -9 +10,2 @@',
    '-removed',
    '+second added',
    '++++ looks like a header but is content',
    'diff --git a/supabase/migrations/1_x.sql b/supabase/migrations/1_x.sql',
    'new file mode 100644',
    '--- /dev/null',
    '+++ b/supabase/migrations/1_x.sql',
    '@@ -0,0 +1 @@',
    '+grant all on x to y;',
    '\\ No newline at end of file',
    'diff --git a/old.ts b/old.ts',
    'deleted file mode 100644',
    '--- a/old.ts',
    '+++ /dev/null',
    '@@ -1 +0,0 @@',
    '-gone',
  ].join('\n');

  it('collects the added lines of each file and nothing else', () => {
    const added = parseAddedText(diff);
    expect(added.get('docs/a.md')).toBe('first added\nsecond added\n+++ looks like a header but is content');
    expect(added.get('supabase/migrations/1_x.sql')).toBe('grant all on x to y;');
    expect(added.has('old.ts')).toBe(false);
  });
});

describe('verify:tier command', () => {
  const script = join(import.meta.dirname, 'verify-tier.ts');
  let repo = '';

  const git = (...args: string[]) => {
    const result = spawnSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd: repo, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
    return result.stdout;
  };

  const write = (path: string, text: string) => {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), text);
  };

  const commit = (message: string) => {
    git('add', '-A');
    git('commit', '-m', message);
  };

  const run = (...args: string[]) => spawnSync(process.execPath, [script, ...args], { cwd: repo, encoding: 'utf8' });

  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), 'verify-tier-'));
    git('init', '-b', 'main');
    write('docs/notes.md', 'one\n');
    write('scripts/draft.sql', 'grant select on public.invoices to authenticated;\n');
    write('packages/core/src/tax/position.ts', 'export const a = 1;\n');
    write('apps/web/src/components/card.tsx', 'export const card = 1;\n');
    commit('base');
    git('checkout', '-b', 'docs-only');
    write('docs/notes.md', 'one\ntwo\n');
    commit('docs');
    git('checkout', '-b', 'taxes', 'main');
    write('packages/core/src/tax/position.ts', 'export const a = 2;\n');
    write('docs/notes.md', 'one\nthree\n');
    commit('tax');
    git('checkout', '-b', 'policy', 'main');
    write('supabase/migrations/20261007301000_x.sql', 'grant select on public.invoices to authenticated;\n');
    commit('policy');
    git('checkout', '-b', 'moved', 'main');
    mkdirSync(join(repo, 'supabase/migrations'), { recursive: true });
    git('mv', 'scripts/draft.sql', 'supabase/migrations/20261007301000_x.sql');
    commit('move');
    git('checkout', '-b', 'removal', 'main');
    git('rm', '-q', 'apps/web/src/components/card.tsx');
    commit('remove');
    git('checkout', 'main');
    write('packages/core/src/tax/position.ts', 'export const a = 3;\n');
    commit('main moves on');
  });

  afterAll(() => rmSync(repo, { recursive: true, force: true }));

  it('prints the tier, then one line per reason', () => {
    const result = run('--base', 'main', '--head', 'taxes');
    expect(result.status).toBe(0);
    const lines = result.stdout.trimEnd().split('\n');
    expect(lines[0]).toBe('Verification tier: rigorous');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatch(/^- .*packages\/core\/src\/tax\/position\.ts/);
  });

  it('reads the added lines of a migration from git', () => {
    expect(run('--base', 'main', '--head', 'policy').stdout).toMatch(/^Verification tier: rigorous/);
  });

  it('reads the whole text of a file moved into the migrations folder', () => {
    expect(run('--base', 'main', '--head', 'moved').stdout).toMatch(/^Verification tier: rigorous/);
  });

  it('counts a deleted file by its name', () => {
    expect(run('--base', 'main', '--head', 'removal').stdout).toMatch(/^Verification tier: standard/);
  });

  it('measures from where the branch left the base, not from the base tip', () => {
    const result = run('--base', 'main', '--head', 'docs-only');
    expect(result.stdout).toMatch(/^Verification tier: lean/);
  });

  it('diffs HEAD when --head is left out', () => {
    git('checkout', '-q', 'docs-only');
    expect(run('--base', 'main').stdout).toMatch(/^Verification tier: lean/);
    git('checkout', '-q', 'main');
  });

  it('exits 1 when the declared tier is below the computed one', () => {
    const result = run('--base', 'main', '--head', 'taxes', '--declared', 'lean');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('lean');
    expect(result.stderr).toContain('rigorous');
    expect(result.stdout).toMatch(/^Verification tier: rigorous/);
  });

  it('accepts a declared tier at or above the computed one', () => {
    expect(run('--base', 'main', '--head', 'taxes', '--declared', 'rigorous').status).toBe(0);
    expect(run('--base', 'main', '--head', 'docs-only', '--declared', 'standard').status).toBe(0);
  });

  it('refuses a declared tier it does not know', () => {
    const result = run('--base', 'main', '--head', 'taxes', '--declared', 'urgent');
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('lean, standard, rigorous');
  });

  it('fails loudly when the base ref does not exist', () => {
    const result = run('--base', 'no-such-ref');
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('no-such-ref');
  });
});
