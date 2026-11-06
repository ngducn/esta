import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { parseSlot, slotPorts, slotWorkdir } from './slot.ts';

export const PROBED_ROLES = ['anon', 'authenticated'] as const;
export type ProbedRole = (typeof PROBED_ROLES)[number];

export type ProbeFunction = { readonly name: string; readonly kind: string; readonly args: readonly string[]; readonly anon: boolean; readonly authenticated: boolean };
export type Outcome = 'denied' | 'crashed' | 'unprobed';

/** A strict immutable function with a null argument is folded to null before the permission check, so text gets a value; the check runs before the body for the rest. */
const argument = (type: string) => (type === 'text' ? "'x'::text" : `null::${type}`);

/** The permission check runs before the body, so a call with these arguments reaches it and stops there when the role may not run the function. */
export function probeSql(role: ProbedRole, fn: ProbeFunction): string {
  const call = `${fn.name}(${fn.args.map(argument).join(', ')})`;
  return `do $probe$ begin set local role ${role}; ${fn.kind === 'p' ? 'call' : 'perform'} ${call}; end $probe$`;
}

/** A denied call must answer permission denied. A dropped connection or a server in recovery is the crash; any other answer means the probe could not build a valid call. */
export function classify(status: number | null, output: string): Outcome {
  if (/permission denied/i.test(output)) return 'denied';
  if (status === 0) return 'unprobed';
  return /unexpected EOF|connection (?:reset|refused|closed|was lost)|recovery mode|terminat|server closed|broken pipe|57P0[0-9]/i.test(output) ? 'crashed' : 'unprobed';
}

export type Tally = { readonly probed: number; readonly denied: number; readonly crashed: readonly string[]; readonly unprobed: readonly string[]; readonly restarts: number };

export function verdict({ probed, denied, crashed, restarts }: Tally): { pass: boolean; summary: string } {
  const pass = crashed.length === 0 && restarts === 0 && denied === probed;
  return { pass, summary: `${denied} of ${probed} denied calls answered permission denied; ${crashed.length} crashed the server; the server restarted ${restarts} time(s)` };
}

const FUNCTIONS_SQL = `select n.nspname || '.' || quote_ident(p.proname) as name, p.prokind as kind,
       to_jsonb(array(select format_type(a.t, null) from unnest(p.proargtypes::oid[]) with ordinality as a(t, o) order by a.o)) as args,
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

export function probe(workdir: string, dbUrl: string, maxCrashes: number): Tally {
  const listed = cli(workdir, dbUrl, FUNCTIONS_SQL);
  if (listed.status !== 0) throw new Error(`could not list functions:\n${listed.output}`);
  const functions = JSON.parse(listed.output.slice(listed.output.indexOf('['), listed.output.lastIndexOf(']') + 1)) as ProbeFunction[];
  let started = startTime(workdir, dbUrl, 0);
  if (started === undefined) throw new Error('the database is not answering');
  const crashed: string[] = [];
  const unprobed: string[] = [];
  let probed = 0;
  let denied = 0;
  let restarts = 0;
  for (const fn of functions) {
    for (const role of PROBED_ROLES) {
      if (fn[role]) continue;
      if (crashed.length >= maxCrashes) return { probed, denied, crashed, unprobed, restarts };
      const { status, output } = cli(workdir, dbUrl, probeSql(role, fn));
      const outcome = classify(status, output);
      if (outcome !== 'unprobed') probed += 1;
      if (outcome === 'denied') denied += 1;
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
  const dbUrl = args.includes('--db-url') ? (flag('--db-url') ?? '') : `postgresql://postgres:postgres@127.0.0.1:${slotPorts(slot).db}/postgres`;
  const maxCrashes = Number(args.includes('--max-crashes') ? flag('--max-crashes') : 10);
  console.log(`Probing denied function calls on ${new URL(dbUrl).host}. A crash restarts that database; run this on the preview project only.`);
  const tally = probe(slotWorkdir(join(import.meta.dirname, '..'), slot), dbUrl, maxCrashes);
  const { pass, summary } = verdict(tally);
  console.log(summary);
  for (const entry of tally.crashed) console.error(`CRASH ${entry}`);
  if (tally.unprobed.length > 0) console.log(`${tally.unprobed.length} call(s) could not be built from the catalog and were not probed:\n  ${tally.unprobed.join('\n  ')}`);
  if (!pass) process.exit(1);
}
