import { join } from 'node:path';
import { query } from './db-checksum.ts';
import { parseSlot, slotWorkdir } from './slot.ts';

const VERDICT = '(valid|verdict|allowed|approved|authori[sz]ed|permitted|checked|ok)$';

/** Public definer functions with a boolean parameter that says a decision was already made: `p_params_valid`, `p_allowed`. */
export function verdictParameters(workdir: string): string[] {
  return query<{ name: string }>(
    workdir,
    `select n.nspname || '.' || p.proname || '(' || a.name || ')' as name
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     cross join lateral unnest(p.proargnames, string_to_array(p.proargtypes::text, ' ')::oid[]) as a (name, type)
     where p.prosecdef and n.nspname = 'public' and a.type = 'bool'::regtype and a.name ~* '${VERDICT}'
     order by 1`,
  ).map(({ name }) => name);
}

/** A caller of the API chooses every argument, so a decision the database acts on is made by the database (#331). */
export function callerVerdictProblems(found: readonly string[]): string[] {
  return found.map((name) => `${name} takes a decision from its caller; decide it inside the function, from the stored rows, and pgTAP the refusal`);
}

export function reportCallerVerdicts(repoRoot: string, slot: number): boolean {
  const problems = callerVerdictProblems(verdictParameters(slotWorkdir(repoRoot, slot)));
  for (const problem of problems) console.error(problem);
  if (problems.length === 0) console.log('Caller verdicts: no public definer function takes a decision as an argument.');
  return problems.length === 0;
}

if (import.meta.main && !reportCallerVerdicts(join(import.meta.dirname, '..'), parseSlot(process.env.ESTA_SLOT))) process.exit(1);
