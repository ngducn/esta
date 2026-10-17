import jsQR from 'jsqr';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CERTIFICATE_FORMS } from '../../../packages/core/src/agent-schemas/certificate_v1.ts';
import { FIXTURE_SPECS, FIXTURES_DIR, renderFixture, renderPages, type FixtureTruth } from './generate.ts';

type Manifest = { fixtures: { id: string; files: Record<string, string> }[] };

const manifest = JSON.parse(readFileSync(join(FIXTURES_DIR, 'manifest.json'), 'utf8')) as Manifest;
const truthOf = (id: string) => JSON.parse(readFileSync(join(FIXTURES_DIR, id, 'truth.json'), 'utf8')) as FixtureTruth;
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const specOf = (id: string) => FIXTURE_SPECS.find((spec) => spec.id === id) ?? expect.fail(`no fixture ${id}`);

describe('certificate fixtures', () => {
  it('renders the same bytes twice and matches the committed manifest', async () => {
    for (const id of ['gcn_2024-scan', 'paper_only-low-light']) {
      const [first, second] = await Promise.all([renderFixture(specOf(id)), renderFixture(specOf(id))]);
      const hashes = Object.fromEntries([...first.files].map(([name, bytes]) => [name, sha256(bytes)]));
      expect(Object.fromEntries([...second.files].map(([name, bytes]) => [name, sha256(bytes)]))).toEqual(hashes);
      expect(manifest.fixtures.find((fixture) => fixture.id === id)?.files).toEqual(hashes);
    }
  }, 30_000);

  it('covers all five forms in three variants plus the north-star fixture', () => {
    expect(new Set(FIXTURE_SPECS.map((spec) => spec.facts.form))).toEqual(new Set(CERTIFICATE_FORMS));
    expect(manifest.fixtures.map((fixture) => fixture.id)).toEqual(FIXTURE_SPECS.map((spec) => spec.id));
    expect(FIXTURE_SPECS).toHaveLength(16);
    expect(truthOf('northstar-di-an').certificate.parcels[0]?.address_text.value).toContain('phường Dĩ An, thành phố Dĩ An, tỉnh Bình Dương');
  });

  it('gives every holder a Demo name, a printed 12-digit ID and NFC text', () => {
    for (const { id } of FIXTURE_SPECS) {
      const truth = truthOf(id);
      for (const holder of truth.certificate.holders) expect(holder.full_name.value, id).toContain('Demo');
      for (const number of truth.printed_id_numbers) expect(number, id).toMatch(/^\d{12}$/);
      const text = readFileSync(join(FIXTURES_DIR, id, 'truth.json'), 'utf8');
      expect(text.normalize('NFC'), id).toBe(text);
    }
  });

  it('marks handwritten fields only on paper_only', () => {
    for (const { id, facts } of FIXTURE_SPECS) {
      expect(truthOf(id).handwritten_fields.length > 0, id).toBe(facts.form === 'paper_only');
    }
  });

  it('prints a gcn_2024 QR code that decodes to the qr_payload', async () => {
    const [first] = await renderPages(specOf('gcn_2024-scan'));
    if (first === undefined) return expect.fail('gcn_2024 has no first page');
    const pixels = new Uint8ClampedArray(first.raster.data);
    expect(jsQR(pixels, first.raster.width, first.raster.height)?.data).toBe(truthOf('gcn_2024-scan').qr_payload);
  });
});
