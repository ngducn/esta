import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertLocal } from './export-source.ts';
import { projectRef } from './lane-otp.ts';
import { parseSlot, slotPorts, slotWorkdir } from './slot.ts';

export const PROBED_ROLES = ['anon', 'authenticated'] as const;
export type ProbedRole = (typeof PROBED_ROLES)[number];

export type ProbeFunction = { readonly name: string; readonly kind: string; readonly args: readonly string[]; readonly argNames: readonly (string | null)[]; readonly anon: boolean; readonly authenticated: boolean };
export type Outcome = 'denied' | 'crashed' | 'unprobed';
export type ProbePath = 'sql' | 'rest';

type Source = Readonly<Record<string, string | undefined>>;
type Refusal = { readonly refusal: string };

/** The probe crashes a database on purpose, so it runs only on this machine or on the preview project, never on production and never on a URL it cannot read. A refusal never repeats the URL, which holds the password. */
export function checkProbeTarget(dbUrl: string, env: Source, apiUrl?: string): { readonly host: string; readonly local: boolean } | Refusal {
  if (env.ESTA_ENV === 'production') return { refusal: 'Refusing: ESTA_ENV=production; this probe restarts the database it runs against' };
  const url = URL.parse(dbUrl);
  if (url === null || !/^postgres(?:ql)?:$/.test(url.protocol)) return { refusal: 'Refusing: --db-url is not a postgres:// URL' };
  let local = true;
  try {
    assertLocal('--db-url', dbUrl);
    if (apiUrl !== undefined) assertLocal('--api-url', apiUrl);
  } catch {
    local = false;
  }
  if (local) return { host: url.host, local };
  const candidate = /^db\.([a-z0-9-]+)\.supabase\.co$/.exec(url.hostname)?.[1] ?? (url.hostname.endsWith('.pooler.supabase.com') ? /^postgres\.([a-z0-9-]+)$/.exec(url.username)?.[1] : undefined);
  const ref = candidate === undefined ? undefined : projectRef(`https://${candidate}.supabase.co`);
  if (ref === undefined) return { refusal: `Refusing: ${url.hostname} is not a local database or a Supabase project database` };
  if (env.ESTA_PRODUCTION_PROJECT_REF !== undefined && env.ESTA_PRODUCTION_PROJECT_REF === ref) return { refusal: `Refusing: project ${ref} is the production project` };
  const preview = env.ESTA_PREVIEW_PROJECT_REF;
  if (preview === undefined || preview === '') return { refusal: 'Refusing: ESTA_PREVIEW_PROJECT_REF is not set' };
  if (ref !== preview) return { refusal: `Refusing: --db-url points at project ${ref}, not the preview project ${preview}` };
  if (apiUrl !== undefined && projectRef(apiUrl) !== ref) return { refusal: `Refusing: --api-url does not point at project ${ref}` };
  return { host: url.host, local };
}

/** A strict immutable function with a null argument is folded to null before the permission check, so text gets a value; the check runs before the body for the rest. */
const argument = (type: string) => (type === 'text' ? "'x'::text" : `null::${type}`);

/** The permission check runs before the body, so a call with these arguments reaches it and stops there when the role may not run the function. */
export function probeSql(role: ProbedRole, fn: ProbeFunction): string {
  const call = `${fn.name}(${fn.args.map(argument).join(', ')})`;
  return `do $probe$ begin set local role ${role}; ${fn.kind === 'p' ? 'call' : 'perform'} ${call}; end $probe$`;
}

/** The body PostgREST needs to find the function: every argument named, with a value of its type. */
export function restBody(fn: ProbeFunction): string {
  return JSON.stringify(Object.fromEntries(fn.args.map((type, i) => [fn.argNames[i] ?? `$${i + 1}`, type === 'text' ? 'x' : null])));
}

const DENIED = /permission denied for (?:function|procedure)/i;
const DROPPED = /unexpected EOF|connection (?:reset|refused|closed|was lost)|recovery mode|terminat|server closed|broken pipe|57P0[0-9]/i;

/** A denied call must answer permission denied for the function. A dropped connection or a server in recovery is the crash; any other answer, such as permission denied to set role or for a schema, means the probe could not build a valid call. */
export function classify(status: number | null, output: string): Outcome {
  if (DENIED.test(output)) return 'denied';
  if (status === 0) return 'unprobed';
  return DROPPED.test(output) ? 'crashed' : 'unprobed';
}

/** PostgREST answers a denied call with the function's permission error; curl failing, or the gateway answering 5xx, means the database went away under the request. */
export function classifyRest(curlStatus: number | null, output: string): Outcome {
  if (DENIED.test(output)) return 'denied';
  return curlStatus !== 0 || /\n5\d\d$/.test(output.trimEnd()) ? 'crashed' : 'unprobed';
}

export type Tally = { readonly probed: number; readonly denied: Readonly<Record<ProbedRole, number>>; readonly crashed: readonly string[]; readonly unprobed: readonly string[]; readonly restarts: number };

/** A pass needs every probed call denied and at least one denied call for each role, so a probe that tested nothing cannot pass. */
export function verdict({ probed, denied, crashed, restarts }: Tally): { pass: boolean; summary: string } {
  const total = denied.anon + denied.authenticated;
  const pass = crashed.length === 0 && restarts === 0 && total === probed && PROBED_ROLES.every((role) => denied[role] > 0);
  return { pass, summary: `${total} of ${probed} denied calls answered permission denied (anon ${denied.anon}, authenticated ${denied.authenticated}); ${crashed.length} crashed the server; the server restarted ${restarts} time(s)` };
}

const FUNCTIONS_SQL = `select n.nspname || '.' || quote_ident(p.proname) as name, p.prokind as kind,
       to_jsonb(array(select format_type(a.t, null) from unnest(p.proargtypes::oid[]) with ordinality as a(t, o) order by a.o)) as args,
       to_jsonb(coalesce(p.proargnames, '{}')) as "argNames",
       has_function_privilege('anon', p.oid, 'execute') as anon,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'private') and p.prokind in ('f', 'p')
  and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
order by 1, 3`;

function cli(workdir: string, dbUrl: string, sql: string) {
  const result = spawnSync('supabase', ['db', 'query', '--workdir', workdir, '--db-url', dbUrl, '--agent=no', '-o', 'json', sql], {
    encoding: 'utf8',
    maxBuffer: 1 << 28,
    env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: '1' },
  });
  if (result.error) throw result.error;
  return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
}

/** Crash recovery discards the statistics, so `stats_reset` changes whenever the server restarted since the last look; the postmaster's own start time does not. */
function startTime(workdir: string, dbUrl: string, waitSeconds: number): string | undefined {
  for (let waited = 0; waited <= waitSeconds; waited += 2) {
    const { status, output } = cli(workdir, dbUrl, 'select stats_reset::text as started from pg_stat_bgwriter');
    const started = /"started":\s*"([^"]+)"/.exec(output)?.[1];
    if (status === 0 && started !== undefined) return started;
    spawnSync('sleep', ['2']);
  }
  return undefined;
}

export type Rest = { readonly apiUrl: string; readonly anonKey: string; readonly userToken: string };

/** The app reaches a function through PostgREST, which exposes `public` only; the call carries the role's own key. */
function restCall(rest: Rest, role: ProbedRole, fn: ProbeFunction) {
  const token = role === 'anon' ? rest.anonKey : rest.userToken;
  const url = `${rest.apiUrl.replace(/\/+$/, '')}/rest/v1/rpc/${fn.name.slice('public.'.length)}`;
  const result = spawnSync('curl', ['-sS', '--max-time', '60', '-X', 'POST', url, '-H', `apikey: ${rest.anonKey}`, '-H', `Authorization: Bearer ${token}`, '-H', 'Content-Type: application/json', '-d', restBody(fn), '-w', '\n%{http_code}'], { encoding: 'utf8' });
  if (result.error) throw result.error;
  return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
}

const asArgs = ({ status, output }: { status: number | null; output: string }): [number | null, string] => [status, output];

export function probe(workdir: string, dbUrl: string, maxCrashes: number, rest?: Rest): Tally {
  const listed = cli(workdir, dbUrl, FUNCTIONS_SQL);
  if (listed.status !== 0) throw new Error(`could not list functions:\n${listed.output}`);
  const all = JSON.parse(listed.output.slice(listed.output.indexOf('['), listed.output.lastIndexOf(']') + 1)) as ProbeFunction[];
  const functions = rest === undefined ? all : all.filter(({ name }) => name.startsWith('public.'));
  let started = startTime(workdir, dbUrl, 0);
  if (started === undefined) throw new Error('the database is not answering');
  const crashed: string[] = [];
  const unprobed: string[] = [];
  const denied = { anon: 0, authenticated: 0 };
  let probed = 0;
  let restarts = 0;
  for (const fn of functions) {
    for (const role of PROBED_ROLES) {
      if (fn[role]) continue;
      if (crashed.length >= maxCrashes) return { probed, denied, crashed, unprobed, restarts };
      const outcome = rest === undefined ? classify(...asArgs(cli(workdir, dbUrl, probeSql(role, fn)))) : classifyRest(...asArgs(restCall(rest, role, fn)));
      if (outcome !== 'unprobed') probed += 1;
      if (outcome === 'denied') denied[role] += 1;
      else if (outcome === 'unprobed') unprobed.push(`${role} ${fn.name}`);
      else crashed.push(`${role} ${fn.name}`);
      const now = startTime(workdir, dbUrl, 90);
      if (now !== started) {
        restarts += 1;
        started = now;
        if (outcome === 'denied') crashed.push(`${role} ${fn.name} (answered, then the server restarted)`);
      }
      if (now === undefined) return { probed, denied, crashed, unprobed, restarts };
    }
  }
  return { probed, denied, crashed, unprobed, restarts };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const flag = (name: string) => args[args.indexOf(name) + 1];
  const slot = parseSlot(process.env.ESTA_SLOT);
  const ports = slotPorts(slot);
  const path: ProbePath = flag('--path') === 'rest' ? 'rest' : 'sql';
  const dbUrl = args.includes('--db-url') ? (flag('--db-url') ?? '') : `postgresql://postgres:postgres@127.0.0.1:${ports.db}/postgres`;
  const apiUrl = args.includes('--api-url') ? (flag('--api-url') ?? '') : `http://127.0.0.1:${ports.api}`;
  const maxCrashes = Number(args.includes('--max-crashes') ? flag('--max-crashes') : 10);
  const target = checkProbeTarget(dbUrl, process.env, path === 'rest' ? apiUrl : undefined);
  if ('refusal' in target) {
    console.error(target.refusal);
    process.exit(2);
  }
  const { ESTA_PROBE_ANON_KEY: anonKey = '', ESTA_PROBE_USER_TOKEN: userToken = '' } = process.env;
  if (path === 'rest' && (anonKey === '' || userToken === '')) {
    console.error('The rest path needs ESTA_PROBE_ANON_KEY and ESTA_PROBE_USER_TOKEN (a signed-in member\'s access token) in the shell');
    process.exit(2);
  }
  // A cloud database gets an empty working folder, so the Supabase CLI treats it as remote and connects over TLS; a slot's folder is only for a local one.
  const workdir = target.local ? slotWorkdir(join(import.meta.dirname, '..'), slot) : mkdtempSync(join(tmpdir(), 'esta-probe-'));
  console.log(`Probing denied function calls through ${path} on ${target.host}. A crash restarts that database; run this on the preview project only.`);
  const tally = probe(workdir, dbUrl, maxCrashes, path === 'rest' ? { apiUrl, anonKey, userToken } : undefined);
  const { pass, summary } = verdict(tally);
  console.log(`${path}: ${summary}`);
  for (const entry of tally.crashed) console.error(`CRASH ${path} ${entry}`);
  if (tally.unprobed.length > 0) console.log(`${tally.unprobed.length} call(s) could not be built from the catalog and were not probed:\n  ${tally.unprobed.join('\n  ')}`);
  if (!pass) process.exit(1);
}
