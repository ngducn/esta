import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { REQUIRED_FIELDS } from '../packages/core/src/extraction/required-fields.ts';
import type { ExtractionScore } from '../packages/core/src/extraction/score.ts';
import { buildReport, formatReport, privateFixtures, scoreOutput, summaryLine, syntheticFixtures, type FixtureResult } from './extraction-eval.ts';

const FIELDS = REQUIRED_FIELDS.certificate_v1;

function score(valid: boolean, hits: number, highConfidence: { total: number; correct: number }): ExtractionScore {
  return { schemaValid: valid, nullTruth: [], required: FIELDS.map((field, index) => ({ field, hit: index < hits })), highConfidence };
}

function result(id: string, form: FixtureResult['form'], extraction: ExtractionScore): FixtureResult {
  return { id, form, score: extraction, numTurns: 3, wallMs: 20_000, costUsd: 0.05, isError: false };
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
      ...result(`private-${fixture.id}`, fixture.form, scoreOutput(fixture, fixture.truth as Record<string, unknown>)),
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

  it('scores a run that saved nothing as invalid with every required field missed', () => {
    const [fixture] = syntheticFixtures().filter((candidate) => candidate.form === 'paper_only');
    if (fixture === undefined) return expect.fail('no paper_only fixture');
    const missed = scoreOutput(fixture, null);
    expect(missed.schemaValid).toBe(false);
    expect(missed.required.some((field) => field.hit)).toBe(false);
    expect(missed.nullTruth).toHaveLength(2);
    expect(missed.nullTruth.some((field) => field.hit)).toBe(false);
  });

  it('uploads each private folder as the one file the app would store', async () => {
    const root = mkdtempSync(join(tmpdir(), 'esta-private-'));
    const synthetic = join(import.meta.dirname, '..', 'fixtures', 'certificates');
    const folder = (name: string, files: Record<string, string>) => {
      mkdirSync(join(root, name));
      writeFileSync(join(root, name, 'truth.json'), JSON.stringify({ certificate: { form: { value: 'so_do_pre2009' } } }));
      for (const [file, from] of Object.entries(files)) copyFileSync(join(synthetic, from), join(root, name, file));
    };
    try {
      folder('a-scan', { 'scan.pdf': 'so_do_pre2009-scan/document.pdf' });
      folder('b-photos', { '1.jpg': 'so_do_pre2009-photo/page-1.jpg', '2.jpg': 'so_do_pre2009-photo/page-2.jpg' });
      const [scan, photos] = await Promise.all(privateFixtures(root).map((fixture) => fixture.upload()));
      expect(scan?.mimeType).toBe('application/pdf');
      expect(photos?.mimeType).toBe('application/pdf');
      expect((await PDFDocument.load(photos?.buffer ?? new Uint8Array())).getPageCount()).toBe(2);
      folder('c-png', { 'page.png': 'so_do_pre2009-scan/document.pdf' });
      expect(() => privateFixtures(root)).toThrow('private-3 needs one PDF, or JPEG photos of its pages, beside truth.json');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
