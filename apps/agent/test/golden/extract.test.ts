import { scoreExtraction, type ExtractionScore } from '@esta/core/extraction';
import { describe, expect, it } from 'vitest';
import { CRAFTED, extractionFixtures, type UploadFile } from '../../../../fixtures/certificates/generator/uploads.tsx';
import { withExtractSession } from '../../src/jobs/extract-session';
import { DEFAULT_REPLAY_DIR } from '../../src/replay/store';
import { judgeResult } from '../../src/sdk/result';
import { replaySession } from '../../src/sdk/session';

type Ratio = { hits: number; total: number };
const percent = ({ hits, total }: Ratio) => (total === 0 ? 100 : (100 * hits) / total);
const add = (a: Ratio, b: Ratio): Ratio => ({ hits: a.hits + b.hits, total: a.total + b.total });

const fixtures = extractionFixtures();

const replay = (schemaName: 'certificate_v1' | 'utility_bill_v1', upload: UploadFile) =>
  withExtractSession(schemaName, upload, async ({ request, saved }) => ({ run: await replaySession(request, DEFAULT_REPLAY_DIR), saved: saved() }));

describe('extract_document golden test, replay mode (AGENT.md §7.2)', () => {
  it('scores sixteen certificates and two bills at the §7.2 targets', async () => {
    expect(fixtures.filter((fixture) => fixture.schemaName === 'certificate_v1')).toHaveLength(16);
    expect(fixtures.filter((fixture) => fixture.schemaName === 'utility_bill_v1')).toHaveLength(2);
    let schemaValid: Ratio = { hits: 0, total: 0 };
    let required: Ratio = { hits: 0, total: 0 };
    let confident: Ratio = { hits: 0, total: 0 };
    for (const fixture of fixtures) {
      const { run, saved } = await replay(fixture.schemaName, await fixture.upload());
      expect(judgeResult(run.result).ok, fixture.id).toBe(true);
      const score: ExtractionScore = scoreExtraction(fixture.schemaName, fixture.truth, saved ?? {});
      schemaValid = add(schemaValid, { hits: score.schemaValid ? 1 : 0, total: 1 });
      required = add(required, { hits: score.required.filter((field) => field.hit).length, total: score.required.length });
      confident = add(confident, { hits: score.highConfidence.correct, total: score.highConfidence.total });
      const text = JSON.stringify(saved);
      for (const number of fixture.printedIdNumbers) {
        expect(text, `${fixture.id} keeps only the last four digits of ${number.slice(-4)}`).not.toContain(number);
      }
      expect(text, fixture.id).not.toMatch(/\d{12}/);
    }
    const summary = `schema-valid ${percent(schemaValid).toFixed(1)}%, required exact ${percent(required).toFixed(1)}%, high-confidence precision ${percent(confident).toFixed(1)}%`;
    console.log(summary);
    expect(percent(schemaValid)).toBe(100);
    expect(percent(required)).toBeGreaterThanOrEqual(90);
    expect(percent(confident)).toBeGreaterThanOrEqual(97);
  }, 60_000);

  it('saves the repaired area as a number after one rejected answer', async () => {
    const { run, saved } = await replay('certificate_v1', await CRAFTED['repair-invalid-area'].upload());
    expect(run.toolCalls.filter((call) => call.name === 'mcp__esta__save_extraction')).toHaveLength(2);
    expect((saved as { parcels: { area_m2: { value: unknown } }[] } | null)?.parcels[0]?.area_m2.value).toBe(68.4);
  });

  it('books the Read of /etc/hosts as a denial and still saves', async () => {
    const { run, saved } = await replay('certificate_v1', await CRAFTED['deny-outside-read'].upload());
    expect(run.result.permissionDenials).toEqual([{ tool_name: 'Read', tool_use_id: 'replay-1', tool_input: { file_path: '/etc/hosts' } }]);
    expect(saved).not.toBeNull();
  });

  it('saves nothing for a blank page whose three answers all fail validation', async () => {
    const { saved } = await replay('certificate_v1', await CRAFTED['blank-page'].upload());
    expect(saved).toBeNull();
  });
});
