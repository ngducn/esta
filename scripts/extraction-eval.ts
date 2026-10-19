import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { CERTIFICATE_FORMS, type CertificateForm } from '../packages/core/src/agent-schemas/certificate_v1.ts';
import { REQUIRED_FIELDS } from '../packages/core/src/extraction/required-fields.ts';
import { scoreExtraction, type ExtractionScore } from '../packages/core/src/extraction/score.ts';
import { extractionFixtures, photosPdf, type UploadFile } from '../fixtures/certificates/generator/uploads.tsx';

const ROOT = join(import.meta.dirname, '..');
const PRIVATE_DIR = join(ROOT, 'fixtures-private', 'certificates');
const SCHEMA = 'certificate_v1';

export type EvalFixture = { readonly id: string; readonly form: CertificateForm; readonly truth: unknown; upload(): Promise<UploadFile> };

export type FixtureResult = {
  readonly id: string;
  readonly form: CertificateForm;
  readonly score: ExtractionScore;
  readonly numTurns: number;
  readonly wallMs: number;
  readonly costUsd: number;
  readonly isError: boolean;
};

type Ratio = { readonly hits: number; readonly total: number };

export type Report = {
  readonly fixtures: readonly FixtureResult[];
  readonly schemaValid: Ratio;
  readonly required: Ratio;
  readonly nullTruth: Ratio;
  readonly highConfidence: Ratio;
  readonly byForm: readonly { readonly form: CertificateForm; readonly fixtures: number; readonly schemaValid: Ratio; readonly required: Ratio; readonly highConfidence: Ratio }[];
  readonly byField: readonly { readonly field: string; readonly hits: Ratio }[];
  readonly turns: number;
  readonly wallMs: { readonly total: number; readonly max: number };
  readonly costUsd: number;
};

/** A run that saved no valid extraction scores as an empty, schema-invalid object: no hit anywhere. */
export function scoreOutput(fixture: Pick<EvalFixture, 'truth'>, extraction: Record<string, unknown> | null): ExtractionScore {
  if (extraction === null) return { ...scoreExtraction(SCHEMA, fixture.truth, {}), highConfidence: { total: 0, correct: 0 } };
  return scoreExtraction(SCHEMA, fixture.truth, extraction);
}

const sum = (ratios: readonly Ratio[]): Ratio => ({ hits: ratios.reduce((a, r) => a + r.hits, 0), total: ratios.reduce((a, r) => a + r.total, 0) });

function ratios(results: readonly FixtureResult[]) {
  return {
    schemaValid: { hits: results.filter((result) => result.score.schemaValid).length, total: results.length },
    required: sum(results.map((result) => ({ hits: result.score.required.filter((field) => field.hit).length, total: result.score.required.length }))),
    nullTruth: sum(results.map((result) => ({ hits: result.score.nullTruth.filter((field) => field.hit).length, total: result.score.nullTruth.length }))),
    highConfidence: sum(results.map((result) => ({ hits: result.score.highConfidence.correct, total: result.score.highConfidence.total }))),
  };
}

export function buildReport(fixtures: readonly FixtureResult[]): Report {
  const byForm = CERTIFICATE_FORMS.map((form) => fixtures.filter((result) => result.form === form))
    .filter((results) => results.length > 0)
    .map((results) => ({ form: results[0]?.form ?? 'paper_only', fixtures: results.length, ...ratios(results) }));
  const byField = REQUIRED_FIELDS[SCHEMA].map((field) => ({
    field,
    hits: sum(
      fixtures.map((result) => {
        const slot = result.score.required.find((score) => score.field === field);
        return { hits: slot?.hit ? 1 : 0, total: slot === undefined ? 0 : 1 };
      }),
    ),
  }));
  return {
    fixtures,
    ...ratios(fixtures),
    byForm,
    byField,
    turns: fixtures.reduce((total, result) => total + result.numTurns, 0),
    wallMs: { total: fixtures.reduce((total, result) => total + result.wallMs, 0), max: Math.max(0, ...fixtures.map((result) => result.wallMs)) },
    costUsd: fixtures.reduce((total, result) => total + result.costUsd, 0),
  };
}

export const percent = ({ hits, total }: Ratio): string => (total === 0 ? 'n/a' : `${((100 * hits) / total).toFixed(1)}%`);

const count = (ratio: Ratio): string => `${ratio.hits}/${ratio.total} (${percent(ratio)})`;

export function summaryLine(report: Report): string {
  return `schema-valid ${percent(report.schemaValid)}, required exact ${percent(report.required)}, high-confidence precision ${percent(report.highConfidence)}`;
}

/**
 * The private report lists only field names, counts and percentages. A form is a truth value too, so
 * the per-form and per-fixture tables are synthetic only, and no private folder name reaches stdout.
 */
export function formatReport(report: Report, set: 'synthetic' | 'private'): string {
  const lines = [
    `fixtures=${report.fixtures.length} turns=${report.turns} wall_s_total=${(report.wallMs.total / 1000).toFixed(1)} wall_s_max=${(report.wallMs.max / 1000).toFixed(1)} cost_usd=${report.costUsd.toFixed(4)}`,
    '',
    '| Required field | Exact |',
    '| --- | --- |',
    ...report.byField.map((row) => `| ${row.field} | ${count(row.hits)} |`),
  ];
  if (set === 'synthetic') {
    lines.push(
      '',
      '| Form | Fixtures | Schema-valid | Required exact | High-confidence precision |',
      '| --- | --- | --- | --- | --- |',
      ...report.byForm.map((row) => `| ${row.form} | ${row.fixtures} | ${count(row.schemaValid)} | ${count(row.required)} | ${count(row.highConfidence)} |`),
      '',
      '| Fixture | Schema-valid | Required exact | High-confidence correct | Turns | Wall s | Cost USD |',
      '| --- | --- | --- | --- | --- | --- | --- |',
      ...report.fixtures.map((result) => {
        const required = result.score.required.filter((field) => field.hit).length;
        const misses = result.score.required.filter((field) => !field.hit).map((field) => field.field);
        const hc = result.score.highConfidence;
        return `| ${result.id} | ${result.score.schemaValid ? 'yes' : 'no'} | ${required}/${result.score.required.length}${misses.length > 0 ? ` (missed ${misses.join(', ')})` : ''} | ${hc.correct}/${hc.total} | ${result.numTurns} | ${(result.wallMs / 1000).toFixed(1)} | ${result.costUsd.toFixed(4)} |`;
      }),
    );
  }
  lines.push('', `null-truth slots (not in required exact): ${count(report.nullTruth)}`, summaryLine(report));
  return lines.join('\n');
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

const formOf = (truth: unknown): CertificateForm => (truth as { form?: { value?: CertificateForm } }).form?.value ?? 'paper_only';

export function syntheticFixtures(): EvalFixture[] {
  return extractionFixtures()
    .filter((fixture) => fixture.schemaName === SCHEMA)
    .map((fixture) => ({ id: fixture.id, form: formOf(fixture.truth), truth: fixture.truth, upload: fixture.upload }));
}

/** One file per document, as the app stores it (DOC-1): a PDF or one photo as it is, several photos as one PDF in name order (DOC-2). */
function privateUpload(id: string, dir: string, files: readonly string[]): () => Promise<UploadFile> {
  const read = (name: string) => readFileSync(join(dir, name));
  const [first] = files;
  if (first !== undefined && files.length === 1 && /\.pdf$/iu.test(first)) return async () => ({ name: first, mimeType: 'application/pdf', buffer: read(first) });
  if (first === undefined || !files.every((name) => /\.jpe?g$/iu.test(name))) throw new Error(`${id} needs one PDF, or JPEG photos of its pages, beside truth.json`);
  if (files.length === 1) return async () => ({ name: first, mimeType: 'image/jpeg', buffer: read(first) });
  return async () => ({ name: 'photos.pdf', mimeType: 'application/pdf', buffer: await photosPdf(files.map(read)) });
}

/** Ryan's folders hold page files plus a truth.json that is either a certificate_v1 object or `{ "certificate": ... }`. */
function privateFixtures(): EvalFixture[] {
  if (!existsSync(PRIVATE_DIR)) return [];
  return readdirSync(PRIVATE_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(PRIVATE_DIR, entry.name, 'truth.json')))
    .map((entry, index) => {
      const id = `private-${index + 1}`;
      const dir = join(PRIVATE_DIR, entry.name);
      const raw = readJson(join(dir, 'truth.json')) as { certificate?: unknown };
      const truth = raw.certificate ?? raw;
      const files = readdirSync(dir).filter((name) => name !== 'truth.json' && !name.startsWith('.')).sort();
      return { id, form: formOf(truth), truth, upload: privateUpload(id, dir, files) };
    });
}

/** Each fixture runs as the worker's own extract_document request, so the numbers measure the prompt the worker ships. */
async function liveRun(fixtures: readonly EvalFixture[], concurrency: number): Promise<FixtureResult[]> {
  const { slotEnv } = await import('./slot-env.ts');
  const { assertStartAllowed, parseAgentEnv } = await import('../apps/agent/src/env.ts');
  const { liveSession } = await import('../apps/agent/src/sdk/session.ts');
  const { withExtractSession } = await import('../apps/agent/src/jobs/extract-session.ts');
  // The eval writes nothing to Supabase, so the worker's required service key is a placeholder.
  const env = parseAgentEnv({ ...slotEnv(ROOT, 0, { withKeys: false, app: 'agent' }), SUPABASE_SERVICE_ROLE_KEY: 'unused-by-extraction-eval', ESTA_AGENT_MODE: 'live' });
  const mode = assertStartAllowed(env);
  if (mode.agentMode !== 'live') throw new Error('extraction:eval --mode live needs a live agent mode');
  if (/fable/iu.test(mode.model)) throw new Error(`Refusing to run: ESTA_MODEL_ROUTINE=${mode.model} is a Fable model, which this eval may not use`);
  console.log(`auth=${mode.authMode} model=${mode.model}`);
  const results: FixtureResult[] = [];
  const queue = [...fixtures.entries()];
  const worker = async (): Promise<void> => {
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
      const [index, fixture] = next;
      results[index] = await withExtractSession(SCHEMA, await fixture.upload(), async ({ request, saved }) => {
        const started = performance.now();
        const run = await liveSession(request, mode);
        return {
          id: fixture.id,
          form: fixture.form,
          score: scoreOutput(fixture, run.result.isError ? null : saved()),
          numTurns: run.result.numTurns,
          wallMs: Math.round(performance.now() - started),
          costUsd: run.result.costUsd,
          isError: run.result.isError,
        };
      });
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      mode: { type: 'string' },
      set: { type: 'string', default: 'synthetic' },
      only: { type: 'string' },
      concurrency: { type: 'string', default: '4' },
    },
  });
  if (values.mode !== 'live') throw new Error('Every run calls the model: pass --mode live --set synthetic|private');
  const concurrency = Number(values.concurrency);
  if (values.set === 'private') {
    const fixtures = privateFixtures();
    if (fixtures.length === 0) {
      console.log('no private fixtures measured');
      return;
    }
    console.log(formatReport(buildReport(await liveRun(fixtures, concurrency)), 'private'));
    return;
  }
  if (values.set !== 'synthetic') throw new Error(`Unknown --set ${values.set}`);
  const only = values.only?.split(',');
  const fixtures = syntheticFixtures().filter((fixture) => only === undefined || only.includes(fixture.id));
  console.log(formatReport(buildReport(await liveRun(fixtures, concurrency)), 'synthetic'));
}

if (process.argv[1] === import.meta.filename) await main();
