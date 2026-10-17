import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { z } from 'zod';

const TIERS = ['lean', 'standard', 'rigorous'] as const;
export type Tier = (typeof TIERS)[number];

export type Change = { readonly path: string; readonly addedText: string };
type Rule = { readonly tier: Tier; readonly reason: string; readonly match: (change: Change) => boolean };

const tierSchema = z.enum(TIERS);

export const isBelow = (declared: Tier, computed: Tier): boolean => TIERS.indexOf(declared) < TIERS.indexOf(computed);

const TEST_PATH = /^(e2e|fixtures|supabase\/tests)\/|^apps\/(agent|web)\/src\/test\/|\.(test|spec|bench)\.[cm]?[jt]sx?$/;
const isTest = ({ path }: Change) => TEST_PATH.test(path);
const isDoc = ({ path }: Change) => path.startsWith('docs/') || path.endsWith('.md');
const inCode = (folders: RegExp) => (change: Change) => !isTest(change) && !isDoc(change) && folders.test(change.path);
const addsText = (folders: RegExp, text: RegExp) => (change: Change) => inCode(folders)(change) && text.test(change.addedText);

const MONEY_MODULES = /^packages\/core\/src\/(money|allocation|tax|vietqr|schedule|matching|format|parse)\//;
const CRON = /^apps\/web\/src\/(app\/api\/cron|server\/cron)\//;
const AGENT = /^apps\/agent\//;
const AUTH = /^(apps\/web\/src\/(app\/sign-in\/|server\/(sign-in|member|public-paths)\.ts$|server\/supabase\/|proxy\.ts$)|packages\/core\/src\/auth\/)/;
const APP_AND_PACKAGES = /^(apps|packages)\//;
const INVITE_OR_ROLE_PATH = /^(apps|packages)\/.*[/._-](invites?|roles?)([/._-]|$)/;
const INVITE_OR_ROLE_TEXT = /invit(e|ation)|\bmember_role\b|\bhousehold_members\b/i;
const MIGRATION = /^supabase\/migrations\/.+\.sql$/;
const SCREENS = /^apps\/web\/src\/(app|components)\//;
const PACKAGE_JSON = /(^|\/)package\.json$/;
const SCRIPT_ENTRY = /^\s*"[^"]+":\s*"(node|tsx|pnpm|vitest|playwright|eslint|tsc|next|scripts\/|\.claude\/)[^"]*",?$/;

/** Policy helpers such as `enable_household_rls` create policies without the word "policy" in the file. */
const RISKY_SQL =
  /\b(grant|revoke)\b|\b(create|alter)\s+policy\b|\bsecurity\s+definer\b|\bdrop\b|\bdelete\s+from\b|\btruncate\b|\bstorage\b|\benable_(household_rls|soft_delete)\b|\brow\s+level\s+security\b|^\s*update\s+\S+\s+set\b/im;

const onlyScriptEntries = ({ addedText }: Change) => {
  const lines = addedText.split('\n').filter((line) => line.trim() !== '');
  return lines.length > 0 && lines.every((line) => SCRIPT_ENTRY.test(line));
};

export const RULES: readonly Rule[] = [
  { tier: 'rigorous', reason: 'Changes a money module, where a wrong amount reaches invoices, payments or tax', match: inCode(MONEY_MODULES) },
  { tier: 'rigorous', reason: 'Changes a scheduled job that runs with the service role', match: inCode(CRON) },
  { tier: 'rigorous', reason: 'Changes the assistant worker, which runs with the service role and writes for the family', match: inCode(AGENT) },
  { tier: 'rigorous', reason: 'Changes sign-in, the session or who may enter the app', match: inCode(AUTH) },
  {
    tier: 'rigorous',
    reason: 'Changes invites, roles or household membership',
    match: (change) => inCode(INVITE_OR_ROLE_PATH)(change) || addsText(APP_AND_PACKAGES, INVITE_OR_ROLE_TEXT)(change),
  },
  { tier: 'rigorous', reason: 'Adds a migration that changes who can read or write, deletes or rewrites rows, or touches storage', match: addsText(MIGRATION, RISKY_SQL) },
  { tier: 'standard', reason: 'Adds a migration that changes the database', match: inCode(MIGRATION) },
  { tier: 'standard', reason: 'Changes a screen or component Mẹ uses', match: inCode(SCREENS) },
  { tier: 'lean', reason: 'Changes documentation only', match: isDoc },
  { tier: 'lean', reason: 'Changes lint rules', match: ({ path }) => path.startsWith('eslint-rules/') || path === 'eslint.config.mjs' },
  { tier: 'lean', reason: 'Changes tooling scripts', match: ({ path }) => /^(scripts|tools)\//.test(path) },
  { tier: 'lean', reason: 'Adds only script entries to a package.json', match: (change) => PACKAGE_JSON.test(change.path) && onlyScriptEntries(change) },
  { tier: 'lean', reason: 'Changes tests only', match: isTest },
];

const UNMATCHED: Rule = { tier: 'standard', reason: 'Matched by no rule, so it counts as standard', match: () => true };

const listFiles = (paths: readonly string[]) => (paths.length <= 3 ? paths.join(', ') : `${paths.slice(0, 3).join(', ')} and ${paths.length - 3} more`);

export function classify(changes: readonly Change[]): { tier: Tier; reasons: string[] } {
  if (changes.length === 0) return { tier: 'lean', reasons: ['No files changed.'] };
  const findings = changes.flatMap((change) => {
    const hits = RULES.filter((rule) => rule.match(change));
    return (hits.length > 0 ? hits : [UNMATCHED]).map((rule) => ({ rule, path: change.path }));
  });
  const tier = findings.reduce<Tier>((top, { rule }) => (isBelow(top, rule.tier) ? rule.tier : top), 'lean');
  const filesByReason = new Map<string, string[]>();
  for (const { rule, path } of findings) {
    if (rule.tier === tier) filesByReason.set(rule.reason, [...(filesByReason.get(rule.reason) ?? []), path]);
  }
  return { tier, reasons: [...filesByReason].map(([reason, paths]) => `${reason} (${listFiles(paths)})`) };
}

/** Expects the a/ and b/ prefixes, which the caller pins because a user's diff config can change them. */
export function parseAddedText(diff: string): Map<string, string> {
  const added = new Map<string, string[]>();
  let lines: string[] | undefined;
  let inHunk = false;
  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) {
      lines = undefined;
      inHunk = false;
    } else if (!inHunk && line.startsWith('+++ b/')) {
      lines = [];
      added.set(line.slice('+++ b/'.length), lines);
    } else if (line.startsWith('@@')) {
      inHunk = true;
    } else if (inHunk && line.startsWith('+')) {
      lines?.push(line.slice(1));
    }
  }
  return new Map([...added].map(([path, text]) => [path, text.join('\n')]));
}

function git(args: readonly string[]): string {
  const result = spawnSync('git', ['-c', 'core.quotePath=false', ...args], { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim() || result.error?.message}`);
  return result.stdout;
}

/** Three dots compare from where the branch left the base, so commits that landed on the base since do not count as this change. */
function changesBetween(base: string, head: string): Change[] {
  const range = `${base}...${head}`;
  // Without renames a moved file counts as deleted plus added, so its whole text reaches the content rules.
  const flags = ['--no-renames', '--no-color', '--no-ext-diff'];
  const paths = git(['diff', '--name-only', ...flags, range]).split('\n').filter(Boolean);
  const added = parseAddedText(git(['diff', '-U0', '--src-prefix=a/', '--dst-prefix=b/', ...flags, range]));
  return paths.map((path) => ({ path, addedText: added.get(path) ?? '' }));
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
