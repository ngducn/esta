import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { CERTIFICATE_FORMS, type CertificateForm } from '../packages/core/src/agent-schemas/certificate_v1.ts';
import { REQUIRED_FIELDS } from '../packages/core/src/extraction/required-fields.ts';
import { scoreExtraction, type ExtractionScore } from '../packages/core/src/extraction/score.ts';

const ROOT = join(import.meta.dirname, '..');
const SYNTHETIC_DIR = join(ROOT, 'fixtures', 'certificates');
const PRIVATE_DIR = join(ROOT, 'fixtures-private', 'certificates');
export const OUTPUTS_DIR = join(ROOT, 'docs', 'plan', 'spikes', 's5', 'outputs');
const SCHEMA = 'certificate_v1';

export type EvalFixture = { readonly id: string; readonly form: CertificateForm; readonly variant: string; readonly dir: string; readonly files: readonly string[]; readonly truth: unknown };

/** What a live run saves per fixture, so `--from` can rescore without a model call. */
export type SavedOutput = {
  readonly fixture_id: string;
  readonly model: string;
  readonly is_error: boolean;
  readonly num_turns: number;
  readonly wall_ms: number;
  readonly total_cost_usd: number;
  readonly reply: string;
};

export type FixtureResult = {
  readonly id: string;
  readonly form: CertificateForm;
  readonly variant: string;
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

const FENCE = /^```(?:json)?\s*([\s\S]*?)\s*```$/u;

/** The model answers with one JSON object, sometimes inside a code fence; anything else is no extraction. */
export function parseReply(reply: string): unknown {
  const trimmed = reply.trim();
  const body = FENCE.exec(trimmed)?.[1] ?? trimmed.slice(trimmed.indexOf('{'), trimmed.lastIndexOf('}') + 1);
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return null;
  }
}

/** A reply that did not parse scores as an empty, schema-invalid object: no hit anywhere. */
export function scoreOutput(fixture: EvalFixture, output: Pick<SavedOutput, 'reply' | 'is_error'>): ExtractionScore {
  const extraction = output.is_error ? null : parseReply(output.reply);
  if (extraction === null || typeof extraction !== 'object') {
    return { ...scoreExtraction(SCHEMA, fixture.truth, {}), highConfidence: { total: 0, correct: 0 } };
  }
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

export function extractionPrompt(files: readonly string[]): string {
  return [
    'You read Vietnamese land use right certificates (sổ đỏ, sổ hồng, giấy chứng nhận) and handwritten land papers, and return JSON.',
    `The pages of one document are in your working directory, in this order: ${files.join(', ')}. Read every file with the Read tool before you answer. Page numbers count pages in that order, starting at 1; a PDF page counts as one page.`,
    'Answer with one JSON object and nothing else. Every leaf is {"value": ..., "confidence": <0 to 1>, "page": <page number or null>}. The shape:',
    '{"form", "holders": [{"full_name", "birth_year", "id_last4", "address_text", "relation"}], "parcels": [{"parcel_no", "map_sheet_no", "address_text", "area_m2", "use_form", "purposes": [{"land_use_code", "area_m2", "term"}], "origin_text"}], "structures": [{"kind", "footprint_m2", "floor_area_m2", "floors", "structure_text", "completed_year", "ownership_term"}], "serial_no", "book_entry_no", "issued_on", "issued_by", "annotations": [{"date", "text", "kind"}], "has_qr", "notes_text"}',
    'Rules:',
    '- form is one of so_do_pre2009 (red "Giấy chứng nhận quyền sử dụng đất", land only, before 2009), so_hong_pre2009 ("Giấy chứng nhận quyền sở hữu nhà ở và quyền sử dụng đất ở", before 2009), gcn_2009_2024 (unified "Giấy chứng nhận quyền sử dụng đất, quyền sở hữu nhà ở và tài sản khác gắn liền với đất"), gcn_2024 ("Giấy chứng nhận quyền sử dụng đất, quyền sở hữu tài sản gắn liền với đất", with a QR code), paper_only (no certificate: a handwritten or notarized paper).',
    '- Copy names, addresses and other text exactly as printed, with every Vietnamese diacritic. Holder names leave out titles such as Ông, Bà or Hộ ông. On paper_only, the holder is the person who receives the land.',
    '- id_last4 is the last 4 digits of the holder\'s ID number. Never write the full number anywhere.',
    '- Areas are numbers in square metres; a decimal comma is a decimal point, so "125,5 m²" is 125.5 and "1.250,5 m²" is 1250.5. birth_year, floors and completed_year are integers.',
    '- Dates are YYYY-MM-DD. issued_on is the date the authority issued the certificate; it is null when there is no certificate.',
    '- land_use_code is the code as printed, such as ODT, ONT or CLN. term is the term of use as printed.',
    '- annotations are the entries under "Những thay đổi sau khi cấp", with kind one of mortgage, mortgage_release, transfer, change_of_area, other. has_qr is true when a page carries a QR code. notes_text is the "Ghi chú" text verbatim, or null.',
    '- A value that is absent or unreadable is {"value": null, "confidence": 0, "page": null}. An empty list is [].',
    '- confidence is your probability that the value is exactly right. Handwritten values get confidence at most 0.6.',
  ].join('\n');
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

export function syntheticFixtures(): EvalFixture[] {
  const manifest = readJson(join(SYNTHETIC_DIR, 'manifest.json')) as { fixtures: { id: string }[] };
  return manifest.fixtures.map(({ id }) => {
    const dir = join(SYNTHETIC_DIR, id);
    const truth = readJson(join(dir, 'truth.json')) as { form: CertificateForm; variant: string; files: string[]; certificate: unknown };
    return { id, form: truth.form, variant: truth.variant, dir, files: truth.files, truth: truth.certificate };
  });
}

/** Ryan's folders hold page files plus a truth.json that is either a certificate_v1 object or `{ "certificate": ... }`. */
function privateFixtures(): EvalFixture[] {
  if (!existsSync(PRIVATE_DIR)) return [];
  return readdirSync(PRIVATE_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(PRIVATE_DIR, entry.name, 'truth.json')))
    .map((entry, index) => {
      const dir = join(PRIVATE_DIR, entry.name);
      const raw = readJson(join(dir, 'truth.json')) as { certificate?: unknown; form?: { value?: CertificateForm } };
      const truth = (raw.certificate ?? raw) as { form?: { value?: CertificateForm } };
      const files = readdirSync(dir).filter((name) => name !== 'truth.json' && !name.startsWith('.')).sort();
      return { id: `private-${index + 1}`, form: truth.form?.value ?? 'paper_only', variant: 'private', dir, files, truth };
    });
}

function resultOf(fixture: EvalFixture, output: SavedOutput): FixtureResult {
  return {
    id: fixture.id,
    form: fixture.form,
    variant: fixture.variant,
    score: scoreOutput(fixture, output),
    numTurns: output.num_turns,
    wallMs: output.wall_ms,
    costUsd: output.total_cost_usd,
    isError: output.is_error,
  };
}

async function liveRun(fixtures: readonly EvalFixture[], concurrency: number, onDone: (fixture: EvalFixture, output: SavedOutput) => void): Promise<void> {
  const { slotEnv } = await import('./slot-env.ts');
  const { assertStartAllowed, parseAgentEnv } = await import('../apps/agent/src/env.ts');
  const { liveSession } = await import('../apps/agent/src/sdk/session.ts');
  const { canonicalizer } = await import('../apps/agent/src/replay/canonicalize.ts');
  // The eval writes nothing to Supabase, so the worker's required service key is a placeholder.
  const env = parseAgentEnv({ ...slotEnv(ROOT, 0, { withKeys: false, app: 'agent' }), SUPABASE_SERVICE_ROLE_KEY: 'unused-by-extraction-eval', ESTA_AGENT_MODE: 'live' });
  const mode = assertStartAllowed(env);
  if (mode.agentMode !== 'live') throw new Error('extraction:eval --mode live needs a live agent mode');
  if (/fable/iu.test(mode.model)) throw new Error(`Refusing to run: ESTA_MODEL_ROUTINE=${mode.model} is a Fable model, which this spike may not use`);
  console.log(`auth=${mode.authMode} model=${mode.model}`);
  const spec = { kind: 'extraction_eval', builtInTools: ['Read'], mcpTools: [], maxTurns: 12, timeoutMs: 180_000, modelRole: 'routine', handler: { prepare: () => Promise.reject(new Error('extraction:eval runs no worker job')) } } as const;
  const canon = canonicalizer({ householdName: 'Gia đình Demo' });
  const queue = [...fixtures];
  const worker = async (): Promise<void> => {
    for (let fixture = queue.shift(); fixture !== undefined; fixture = queue.shift()) {
      const jobDir = realpathSync(mkdtempSync(join(tmpdir(), 'esta-s5-job-')));
      const configDir = realpathSync(mkdtempSync(join(tmpdir(), 'esta-s5-config-')));
      try {
        for (const file of fixture.files) copyFileSync(join(fixture.dir, file), join(jobDir, file));
        const started = performance.now();
        const run = await liveSession({ spec, prompt: extractionPrompt(fixture.files), jobDir, configDir, tools: new Map(), canon }, mode);
        onDone(fixture, {
          fixture_id: fixture.id,
          model: run.model,
          is_error: run.result.isError,
          num_turns: run.result.numTurns,
          wall_ms: Math.round(performance.now() - started),
          total_cost_usd: run.result.costUsd,
          reply: run.result.text,
        });
      } finally {
        rmSync(jobDir, { recursive: true, force: true });
        rmSync(configDir, { recursive: true, force: true });
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
}

function rescore(dir: string, fixtures: readonly EvalFixture[]): FixtureResult[] {
  return fixtures.map((fixture) => {
    const path = join(dir, `${fixture.id}.json`);
    if (!existsSync(path)) throw new Error(`${path} is missing; run --mode live --set synthetic first`);
    return resultOf(fixture, readJson(path) as SavedOutput);
  });
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      mode: { type: 'string' },
      set: { type: 'string', default: 'synthetic' },
      from: { type: 'string' },
      only: { type: 'string' },
      concurrency: { type: 'string', default: '4' },
    },
  });
  const only = values.only?.split(',');
  const pick = (fixtures: EvalFixture[]) => (only === undefined ? fixtures : fixtures.filter((fixture) => only.includes(fixture.id)));
  if (values.from !== undefined) {
    console.log('auth=none');
    const started = performance.now();
    const report = buildReport(rescore(values.from, pick(syntheticFixtures())));
    console.log(formatReport(report, 'synthetic'));
    console.log(`rescore_ms=${Math.round(performance.now() - started)}`);
    return;
  }
  if (values.mode !== 'live') throw new Error('Pass --from <dir> to rescore saved outputs, or --mode live --set synthetic|private');
  const concurrency = Number(values.concurrency);
  if (values.set === 'private') {
    const fixtures = privateFixtures();
    if (fixtures.length === 0) {
      console.log('no private fixtures measured');
      return;
    }
    const results: FixtureResult[] = [];
    await liveRun(fixtures, concurrency, (fixture, output) => results.push(resultOf(fixture, output)));
    console.log(formatReport(buildReport(results), 'private'));
    return;
  }
  if (values.set !== 'synthetic') throw new Error(`Unknown --set ${values.set}`);
  mkdirSync(OUTPUTS_DIR, { recursive: true });
  const fixtures = pick(syntheticFixtures());
  await liveRun(fixtures, concurrency, (fixture, output) => {
    writeFileSync(join(OUTPUTS_DIR, `${fixture.id}.json`), `${JSON.stringify(output, null, 2)}\n`);
    console.log(`${fixture.id} turns=${output.num_turns} wall_s=${(output.wall_ms / 1000).toFixed(1)} cost_usd=${output.total_cost_usd.toFixed(4)} is_error=${output.is_error}`);
  });
  console.log(formatReport(buildReport(rescore(OUTPUTS_DIR, syntheticFixtures())), 'synthetic'));
}

if (process.argv[1] === import.meta.filename) await main();
