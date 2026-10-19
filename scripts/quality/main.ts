import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { findClones, readCorpus } from './measure.ts';
import { METRICS } from './metrics.ts';
import { baselineSchema, judge, passes, rebase, report, serialize, type Baseline, type Reading } from './ratchet.ts';

export const BASELINE = 'quality/baseline.json';
const EMPTY: Baseline = { metrics: {}, raises: [] };

export function readBaseline(root: string): Baseline {
  const path = join(root, BASELINE);
  return existsSync(path) ? baselineSchema.parse(JSON.parse(readFileSync(path, 'utf8'))) : EMPTY;
}

export function measure(root: string): Reading[] {
  const input = { corpus: readCorpus(root), clones: findClones(root) };
  return METRICS.map((metric) => ({ metric, occurrences: metric.measure(input) }));
}

export type Outcome = { readonly ok: boolean; readonly lines: readonly string[] };

export function run(root: string, { update, allowRaise }: { update: boolean; allowRaise?: string | undefined }): Outcome {
  const baseline = readBaseline(root);
  const verdicts = judge(baseline, measure(root));
  if (!update) {
    const ok = passes(verdicts);
    return { ok, lines: ok ? [] : [...report(verdicts), 'The quality baseline only goes down. ARCHITECTURE.md names the home for each concern.'] };
  }
  const rebased = rebase(baseline, verdicts, allowRaise);
  if ('refused' in rebased) {
    return { ok: false, lines: [...report(rebased.refused), 'Nothing written. A raise needs --allow-raise "<reason>", and a cap cannot be raised.'] };
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
