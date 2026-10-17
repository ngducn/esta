import { spawnSync } from 'node:child_process';
import { isDeepStrictEqual, parseArgs } from 'node:util';
import { z } from 'zod';

const TIERS = ['lean', 'standard', 'rigorous'] as const;
export type Tier = (typeof TIERS)[number];

/** `before` and `after` are the file at the merge base and at head. `undefined` means the text was not read or could not be read (binary, too large), and rules then decide by path alone. */
export type Change = { readonly path: string; readonly before?: string | undefined; readonly after?: string | undefined };
type Rule = { readonly tier: Tier; readonly reason: string; readonly match: (change: Change) => boolean };

const tierSchema = z.enum(TIERS);

export const isBelow = (declared: Tier, computed: Tier): boolean => TIERS.indexOf(declared) < TIERS.indexOf(computed);

function subtract(lines: readonly string[], taken: readonly string[]): string[] {
  const left = new Map<string, number>();
  for (const line of taken) left.set(line, (left.get(line) ?? 0) + 1);
  return lines.filter((line) => {
    const count = left.get(line) ?? 0;
    if (count > 0) left.set(line, count - 1);
    return count === 0;
  });
}

export function addedLines({ before, after }: Change): string[] | undefined {
  if (before === undefined || after === undefined) return undefined;
  return subtract(after.split('\n'), before.split('\n'));
}

const TEST_PATH = /^(e2e|fixtures|supabase\/tests)\/|^apps\/(agent|web)\/src\/test\/|\.(test|spec|bench)\.[cm]?[jt]sx?$/;
const isTest = ({ path }: Change) => TEST_PATH.test(path);
const isDoc = ({ path }: Change) => path.startsWith('docs/') || path.endsWith('.md');
const inCode = (folders: RegExp) => (change: Change) => !isTest(change) && !isDoc(change) && folders.test(change.path);
const addsText = (folders: RegExp, text: RegExp) => (change: Change) => inCode(folders)(change) && text.test(addedLines(change)?.join('\n') ?? '');

const MONEY_MODULES = /^packages\/core\/src\/(money|allocation|tax|vietqr|schedule|matching|format|parse)\//;
const CRON = /^apps\/web\/src\/(app\/api\/cron|server\/cron)\//;
const AUTH = /^(apps\/web\/src\/(app\/sign-in\/|server\/(sign-in|member|public-paths)\.ts$|server\/supabase\/|proxy\.ts$)|packages\/core\/src\/auth\/)/;
const ONBOARDING = /^apps\/web\/src\/app\/onboarding\//;
const APP_AND_PACKAGES = /^(apps|packages)\//;
const INVITE_OR_ROLE_PATH = /^(apps|packages)\/.*[/._-](invites?|roles?)([/._-]|$)/;
const INVITE_OR_ROLE_TEXT = /invit(e|ation)|\bcreate_household\b|\bmember_role\b|\bhousehold_members\b|\b(is_operator|operator_flag)\b/i;
const SECURITY_LINT_RULES = new Set([
  'eslint-rules/service-role-allowlist.mjs',
  'eslint-rules/no-browser-supabase-client.mjs',
  'eslint-rules/no-guard-disable.mjs',
]);
const MIGRATIONS = /^supabase\/migrations\//;
const SUPABASE_CONFIG = 'supabase/config.toml';
const AUTH_SECTION = /^auth(\.|\n)/;
const SCREENS = /^apps\/web\/src\/(app|components)\//;
const DEPLOY_AND_SEED = /^(\.github\/|supabase\/seed\/|apps\/web\/(src\/)?middleware\.[cm]?[jt]s$|(apps\/web\/)?next\.config\.[cm]?[jt]s$)/;
const PACKAGE_JSON = /(^|\/)package\.json$/;
const GUARDED_WITHOUT_RULE = /^(packages\/core|apps\/agent)\//;

const manifestSchema = z.looseObject({ scripts: z.record(z.string(), z.string()).optional() });

function parseManifest(text: string | undefined) {
  if (text === undefined) return undefined;
  try {
    const parsed = manifestSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

const INSTALL_EVENTS = new Set(['install', 'prepare', 'prepublish', 'prepublishOnly', 'publish', 'pack', 'uninstall', 'version', 'dependencies']);

/** An install event, or a pre/post hook that pnpm runs by itself around an install event or another script. */
function isLifecycle(name: string, scripts: Record<string, string>): boolean {
  if (INSTALL_EVENTS.has(name)) return true;
  const target = /^(?:pre|post)(.+)$/.exec(name)?.[1];
  return target !== undefined && (INSTALL_EVENTS.has(target) || target in scripts);
}

/** `undefined` when either side is unreadable, a missing file, or not a manifest. */
function diffManifest({ before, after }: Change) {
  const old = parseManifest(before);
  const next = parseManifest(after);
  if (old === undefined || next === undefined) return undefined;
  const { scripts: oldScripts = {}, ...oldRest } = old;
  const { scripts: newScripts = {}, ...newRest } = next;
  const added = Object.keys(newScripts).filter((name) => !(name in oldScripts));
  const changed = Object.keys(newScripts).filter((name) => newScripts[name] !== oldScripts[name]);
  const onlyAdditions =
    isDeepStrictEqual(oldRest, newRest) && Object.entries(oldScripts).every(([name, value]) => newScripts[name] === value) && added.length > 0;
  return { onlyAdditions, runsOnItsOwn: changed.some((name) => isLifecycle(name, newScripts)) };
}

const isPackageJson = ({ path }: Change) => PACKAGE_JSON.test(path);
const addsOnlyScripts = (change: Change) => {
  const diff = isPackageJson(change) ? diffManifest(change) : undefined;
  return diff !== undefined && diff.onlyAdditions && !diff.runsOnItsOwn;
};

const withSections = (text: string) => {
  let section = '';
  return text.split('\n').map((line) => {
    section = /^\s*\[+([^\]]+)\]/.exec(line)?.[1] ?? section;
    return `${section}\n${line}`;
  });
};

/** Lines gained or lost, so deleting a setting counts as changing it. A file that cannot be read counts as changed. */
function changesAuthSettings({ path, before, after }: Change): boolean {
  if (path !== SUPABASE_CONFIG) return false;
  if (before === undefined || after === undefined) return true;
  const [oldLines, newLines] = [withSections(before), withSections(after)];
  return [...subtract(newLines, oldLines), ...subtract(oldLines, newLines)].some((line) => AUTH_SECTION.test(line));
}

export const RULES: readonly Rule[] = [
  { tier: 'rigorous', reason: 'Changes a money module, where a wrong amount reaches invoices, payments or tax', match: inCode(MONEY_MODULES) },
  { tier: 'rigorous', reason: 'Changes a scheduled job that runs with the service role', match: inCode(CRON) },
  {
    tier: 'rigorous',
    reason: 'Changes the assistant worker, which runs with the service role and writes for the family, or a prompt it reads',
    match: (change) => change.path.startsWith('apps/agent/') && !isTest(change),
  },
  { tier: 'rigorous', reason: 'Changes sign-in, the session or who may enter the app', match: inCode(AUTH) },
  { tier: 'rigorous', reason: 'Changes onboarding, where a household and its first admin are created', match: inCode(ONBOARDING) },
  {
    tier: 'rigorous',
    reason: 'Changes invites, roles or household membership',
    match: (change) => inCode(INVITE_OR_ROLE_PATH)(change) || addsText(APP_AND_PACKAGES, INVITE_OR_ROLE_TEXT)(change),
  },
  { tier: 'rigorous', reason: 'Changes a lint rule that guards the security boundary', match: ({ path }) => SECURITY_LINT_RULES.has(path) },
  { tier: 'rigorous', reason: 'Adds, edits or removes a migration, and every migration counts as rigorous whatever it says', match: ({ path }) => MIGRATIONS.test(path) },
  { tier: 'rigorous', reason: 'Changes sign-in settings in the Supabase configuration, or a configuration that cannot be read', match: changesAuthSettings },
  {
    tier: 'rigorous',
    reason: 'Adds or changes an install or pre/post script, which runs code on every install or every run of another script',
    match: (change) => isPackageJson(change) && diffManifest(change)?.runsOnItsOwn === true,
  },
  { tier: 'standard', reason: 'Changes the local Supabase configuration', match: ({ path }) => path === SUPABASE_CONFIG },
  { tier: 'standard', reason: 'Changes build, deploy, middleware or seed configuration', match: (change) => !isTest(change) && DEPLOY_AND_SEED.test(change.path) },
  { tier: 'standard', reason: 'Changes a screen or component Mẹ uses', match: inCode(SCREENS) },
  {
    tier: 'standard',
    reason: 'Changes a package.json beyond new script entries',
    match: (change) => isPackageJson(change) && !addsOnlyScripts(change),
  },
  {
    tier: 'standard',
    reason: 'Changes lint rules or their configuration',
    match: (change) => !isTest(change) && (change.path.startsWith('eslint-rules/') || change.path === 'eslint.config.mjs'),
  },
  { tier: 'standard', reason: 'Changes a script that may run with the service role', match: (change) => !isTest(change) && change.path.startsWith('scripts/') },
  { tier: 'lean', reason: 'Changes documentation only', match: isDoc },
  { tier: 'lean', reason: 'Changes tooling in tools/', match: ({ path }) => path.startsWith('tools/') },
  { tier: 'lean', reason: 'Adds only script entries to a package.json', match: addsOnlyScripts },
  { tier: 'lean', reason: 'Changes tests only', match: isTest },
];

const fallback = ({ path }: Change): Rule =>
  GUARDED_WITHOUT_RULE.test(path)
    ? { tier: 'rigorous', reason: 'Is in the domain core or the assistant worker and no lighter rule names it, so it counts as rigorous', match: () => true }
    : { tier: 'standard', reason: 'Matched by no rule, so it counts as standard', match: () => true };

const listFiles = (paths: readonly string[]) => (paths.length <= 3 ? paths.join(', ') : `${paths.slice(0, 3).join(', ')} and ${paths.length - 3} more`);

export function classify(changes: readonly Change[]): { tier: Tier; reasons: string[] } {
  if (changes.length === 0) return { tier: 'lean', reasons: ['No files changed.'] };
  const findings = changes.flatMap((change) => {
    const hits = RULES.filter((rule) => rule.match(change));
    return (hits.length > 0 ? hits : [fallback(change)]).map((rule) => ({ rule, path: change.path }));
  });
  const tier = findings.reduce<Tier>((top, { rule }) => (isBelow(top, rule.tier) ? rule.tier : top), 'lean');
  const filesByReason = new Map<string, string[]>();
  for (const { rule, path } of findings) {
    if (rule.tier === tier) filesByReason.set(rule.reason, [...(filesByReason.get(rule.reason) ?? []), path]);
  }
  return { tier, reasons: [...filesByReason].map(([reason, paths]) => `${reason} (${listFiles(paths)})`) };
}

function git(args: readonly string[]): string {
  const result = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim() || result.error?.message}`);
  return result.stdout;
}

/** Reads the raw blob, so `.gitattributes` and diff drivers cannot hide text. */
function readBlob(rev: string, path: string): string | undefined {
  const result = spawnSync('git', ['cat-file', 'blob', `${rev}:${path}`], { maxBuffer: 1 << 24 });
  if (result.status !== 0 || result.stdout.includes(0)) return undefined;
  return result.stdout.toString('utf8');
}

const wantsText = (path: string) => PACKAGE_JSON.test(path) || path === SUPABASE_CONFIG || APP_AND_PACKAGES.test(path);

/** Three dots compare from where the branch left the base, so commits that landed on the base since do not count as this change. */
function changesBetween(base: string, head: string): Change[] {
  const mergeBase = git(['merge-base', base, head]).trim();
  // -z keeps paths with spaces, quotes or non-ASCII letters raw. Without renames a moved file is one deletion and one addition.
  const fields = git(['diff', '-z', '--name-status', '--no-renames', '--no-color', '--no-ext-diff', `${base}...${head}`]).split('\0');
  const changes: Change[] = [];
  for (let i = 0; i + 1 < fields.length; i += 2) {
    const status = fields[i] ?? '';
    const path = fields[i + 1] ?? '';
    if (!wantsText(path)) {
      changes.push({ path });
      continue;
    }
    changes.push({
      path,
      before: status.startsWith('A') ? '' : readBlob(mergeBase, path),
      after: status.startsWith('D') ? '' : readBlob(head, path),
    });
  }
  return changes;
}

function parseDeclared(value: string | undefined): Tier | undefined {
  if (value === undefined) return undefined;
  const parsed = tierSchema.safeParse(value);
  if (!parsed.success) throw new Error(`--declared must be one of ${TIERS.join(', ')}, not "${value}"`);
  return parsed.data;
}

function main(argv: string[]): number {
  try {
    const { values } = parseArgs({
      args: argv,
      options: { base: { type: 'string', default: 'origin/main' }, head: { type: 'string', default: 'HEAD' }, declared: { type: 'string' } },
    });
    const declared = parseDeclared(values.declared);
    const { tier, reasons } = classify(changesBetween(values.base, values.head));
    console.log([`Verification tier: ${tier}`, ...reasons.map((reason) => `- ${reason}`)].join('\n'));
    if (declared !== undefined && isBelow(declared, tier)) {
      console.error(`The declared tier ${declared} is below the computed tier ${tier}. A PR can move up a tier, never down.`);
      return 1;
    }
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2));
