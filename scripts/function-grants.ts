import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { query } from './db-checksum.ts';
import { parseSlot, slotWorkdir } from './slot.ts';

export const ALLOWLIST = 'quality/function-grants.json';

export type FunctionGrant = { readonly signature: string; readonly schema: string; readonly anon: boolean; readonly authenticated: boolean; readonly public: boolean };
export type Allowlist = { readonly anon: Readonly<Record<string, string>>; readonly authenticated: Readonly<Record<string, string>> };

/** Every function Esta owns in `public` and `private`, keyed by its full signature so an overload is its own entry; a function an extension owns is the extension's. */
export function functionGrants(workdir: string): FunctionGrant[] {
  return query<FunctionGrant>(
    workdir,
    `select n.nspname as schema, n.nspname || '.' || p.proname || regexp_replace(p.oid::regprocedure::text, '^[^(]*', '') as signature,
            has_function_privilege('anon', p.oid, 'execute') as anon,
            has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
            has_function_privilege('public', p.oid, 'execute') as public
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private') and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
     order by 2`,
  );
}

const unique = (names: readonly string[]) => [...new Set(names)];

/** Postgres lets `anon` and `public` run what a `revoke` forgot; one denied call can crash the local image (supautils, docs/plan/STATUS.md), so no grant is implicit. */
export function grantProblems(grants: readonly FunctionGrant[], allowed: Allowlist): string[] {
  const privateFns = grants.filter(({ schema }) => schema === 'private');
  const anonNames = unique(grants.filter(({ anon }) => anon).map(({ signature }) => signature));
  const authenticatedNames = unique(privateFns.filter(({ authenticated }) => authenticated).map(({ signature }) => signature));
  return [
    ...unique(privateFns.filter(({ public: everyone }) => everyone).map(({ signature }) => signature)).map((name) => `${name} is executable by public; revoke execute from public, anon and authenticated, then grant it back only if a policy or constraint needs it`),
    ...anonNames.filter((name) => !(name in allowed.anon)).map((name) => `${name} is executable by anon and is not in ${ALLOWLIST}; revoke execute from public and anon, or add it with the reason an anonymous caller needs it`),
    ...authenticatedNames.filter((name) => !(name in allowed.authenticated)).map((name) => `${name} is executable by authenticated and is not in ${ALLOWLIST}; revoke it, or add it with the policy, constraint or view that calls it`),
    ...Object.keys(allowed.anon).filter((name) => !anonNames.includes(name)).map((name) => `${name} is no longer executable by anon; remove it from ${ALLOWLIST}`),
    ...Object.keys(allowed.authenticated).filter((name) => !authenticatedNames.includes(name)).map((name) => `${name} is no longer executable by authenticated; remove it from ${ALLOWLIST}`),
  ];
}

export function reportFunctionGrants(repoRoot: string, slot: number): boolean {
  const allowed = JSON.parse(readFileSync(join(repoRoot, ALLOWLIST), 'utf8')) as Allowlist;
  const grants = functionGrants(slotWorkdir(repoRoot, slot));
  const problems = grantProblems(grants, allowed);
  for (const problem of problems) console.error(problem);
  if (problems.length === 0) console.log(`Function grants: ${grants.length} functions, ${Object.keys(allowed.anon).length} open to anon and ${Object.keys(allowed.authenticated).length} private ones open to authenticated, all on the allowlist.`);
  return problems.length === 0;
}

if (import.meta.main && !reportFunctionGrants(join(import.meta.dirname, '..'), parseSlot(process.env.ESTA_SLOT))) process.exit(1);
