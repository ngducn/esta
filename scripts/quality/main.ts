import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { findClones, readCorpus } from './measure.ts';
import { METRICS } from './metrics.ts';
import { baselineSchema, judge, passes, rebase, report, serialize, type Baseline, type Reading } from './ratchet.ts';

export const BASELINE = 'quality/baseline.json';

const parseBaseline = (text: string) => baselineSchema.parse(JSON.parse(text));

function readBaseline(root: string): Baseline | undefined {
  const path = join(root, BASELINE);
  return existsSync(path) ? parseBaseline(readFileSync(path, 'utf8')) : undefined;
}

function git(root: string, ...args: string[]): string | undefined {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  return result.status === 0 ? result.stdout : undefined;
}

/**
 * The baseline this branch started from: the committed copy where it forked from origin/main, so a hand edit, a
 * deleted key or an --update above it needs a recorded raise, and a later gain on main does not fail an older branch.
 * Without origin, or before main has a baseline, the working copy stands in.
 */
function readMain(root: string): Baseline | undefined {
  const fork = git(root, 'merge-base', 'HEAD', 'origin/main')?.trim();
  const committed = fork === undefined ? undefined : git(root, 'show', `${fork}:${BASELINE}`);
  return committed === undefined ? readBaseline(root) : parseBaseline(committed);
}

export function measure(root: string): Reading[] {
  const input = { corpus: readCorpus(root), clones: findClones(root) };
  return METRICS.map((metric) => ({ metric, occurrences: metric.measure(input) }));
}

export type Outcome = { readonly ok: boolean; readonly lines: readonly string[] };

export function run(root: string, { update, allowRaise }: { update: boolean; allowRaise?: string | undefined }): Outcome {
  const baseline = readBaseline(root) ?? { metrics: {}, raises: [] };
  const main = readMain(root);
  const readings = measure(root);
  if (!update) {
    const verdicts = judge(baseline, main, readings);
    const ok = passes(verdicts);
    return { ok, lines: ok ? [] : [...report(verdicts), 'The quality baseline only goes down. ARCHITECTURE.md names the home for each concern.'] };
  }
  const rebased = rebase(baseline, main, readings, allowRaise);
  if ('refused' in rebased) {
    return { ok: false, lines: [...report(rebased.refused), `Nothing written. A count above main's needs --allow-raise "<reason>", and a cap cannot be raised.`] };
  }
  writeFileSync(join(root, BASELINE), serialize(rebased.baseline));
  return { ok: true, lines: [`Wrote ${BASELINE}.`] };
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { update: { type: 'boolean', default: false }, 'allow-raise': { type: 'string' } } });
  const allowRaise = values['allow-raise']?.trim();
  if (allowRaise === '') throw new Error('--allow-raise needs a reason');
  const started = performance.now();
  const outcome = run(join(import.meta.dirname, '..', '..'), { update: values.update || allowRaise !== undefined, allowRaise });
  for (const line of outcome.lines) console.log(line);
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  console.log(`quality: ${outcome.ok ? 'PASS' : 'FAIL'}, ${METRICS.length} metrics in ${seconds} s`);
  process.exitCode = outcome.ok ? 0 : 1;
}
