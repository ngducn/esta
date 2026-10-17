import { describe, expect, it } from 'vitest';
import { REQUIRED_FIELDS } from '../packages/core/src/extraction/required-fields.ts';
import type { ExtractionScore } from '../packages/core/src/extraction/score.ts';
import { buildReport, formatReport, parseReply, scoreOutput, summaryLine, syntheticFixtures, type FixtureResult } from './extraction-eval.ts';

const FIELDS = REQUIRED_FIELDS.certificate_v1;

function score(valid: boolean, hits: number, highConfidence: { total: number; correct: number }): ExtractionScore {
  return { schemaValid: valid, required: FIELDS.map((field, index) => ({ field, hit: index < hits })), highConfidence };
}

function result(id: string, form: FixtureResult['form'], extraction: ExtractionScore): FixtureResult {
  return { id, form, variant: 'scan', score: extraction, numTurns: 3, wallMs: 20_000, costUsd: 0.05, isError: false };
}

describe('extraction eval report', () => {
  it('prints the summary line from a fixed set of scores', () => {
    const report = buildReport([
      result('a', 'gcn_2024', score(true, 7, { total: 10, correct: 10 })),
      result('b', 'gcn_2024', score(true, 6, { total: 10, correct: 9 })),
      result('c', 'paper_only', score(false, 0, { total: 0, correct: 0 })),
      result('d', 'so_do_pre2009', score(true, 7, { total: 20, correct: 19 })),
    ]);
    expect(summaryLine(report)).toBe('schema-valid 75.0%, required exact 71.4%, high-confidence precision 95.0%');
    expect(report.byForm.map((row) => row.form)).toEqual(['so_do_pre2009', 'gcn_2024', 'paper_only']);
    expect(report.byField.find((row) => row.field === 'parcels[].parcel_no')?.hits).toEqual({ hits: 3, total: 4 });
    expect(report.costUsd).toBeCloseTo(0.2);
  });

  it('keeps every truth value and fixture name out of the private report', () => {
    const fixtures = syntheticFixtures();
    const results = fixtures.map((fixture) => ({
      ...result(`private-${fixture.id}`, fixture.form, scoreOutput(fixture, { is_error: false, reply: JSON.stringify(fixture.truth) })),
    }));
    const output = formatReport(buildReport(results), 'private');
    expect(output).toContain('schema-valid 100.0%, required exact 100.0%');
    const values = new Set<string>();
    const collect = (node: unknown): void => {
      if (typeof node === 'string' || typeof node === 'number') values.add(String(node));
      else if (typeof node === 'object' && node !== null) Object.values(node).forEach(collect);
    };
    fixtures.forEach((fixture) => collect(fixture.truth));
    const leaked = [...values].filter((value) => value.length >= 3 && !/^\d{1,4}$/.test(value) && output.includes(value));
    expect(leaked).toEqual([]);
    for (const fixture of fixtures) expect(output).not.toContain(fixture.id);
  });

  it('scores an unparseable or failed reply as invalid with every required field missed', () => {
    const [fixture] = syntheticFixtures().filter((candidate) => candidate.form === 'paper_only');
    if (fixture === undefined) return expect.fail('no paper_only fixture');
    for (const output of [{ is_error: false, reply: 'Tôi không đọc được.' }, { is_error: true, reply: JSON.stringify(fixture.truth) }]) {
      const missed = scoreOutput(fixture, output);
      expect(missed.schemaValid).toBe(false);
      expect(missed.required.some((field) => field.hit)).toBe(false);
    }
  });

  it('reads a reply wrapped in a json code fence', () => {
    expect(parseReply('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
    expect(parseReply('Here it is: {"a": 1}')).toEqual({ a: 1 });
    expect(parseReply('no json')).toBeNull();
  });
});
