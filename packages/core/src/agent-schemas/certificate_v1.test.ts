import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { certificateV1Schema } from './certificate_v1';

const FIXTURES = join(import.meta.dirname, '../../../../fixtures/certificates');

const truths = readdirSync(FIXTURES, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== 'generator')
  .map((entry) => ({ id: entry.name, truth: JSON.parse(readFileSync(join(FIXTURES, entry.name, 'truth.json'), 'utf8')) as { certificate: unknown } }));

const leaf = (value: unknown) => ({ value, confidence: 0.95, page: 1 });

type Cert = { holders: Record<string, unknown>[]; parcels: Record<string, unknown>[]; structures: Record<string, unknown>[] };

function withHolderId(idLast4: string) {
  const first = truths[0]?.truth.certificate as { holders: Record<string, unknown>[] };
  return { ...first, holders: [{ ...first.holders[0], id_last4: leaf(idLast4) }] };
}

describe('certificateV1Schema', () => {
  it('accepts every committed truth.json', () => {
    expect(truths).toHaveLength(16);
    for (const { id, truth } of truths) expect(certificateV1Schema.safeParse(truth.certificate).success, id).toBe(true);
  });

  it('rejects a full 12-digit ID number in id_last4', () => {
    expect(certificateV1Schema.safeParse(withHolderId('079084301776')).success).toBe(false);
    expect(certificateV1Schema.safeParse(withHolderId('1776')).success).toBe(true);
  });

  it.each([
    ['birth_year', (cert: Cert) => ({ ...cert, holders: [{ ...cert.holders[0], birth_year: leaf(79062118340) }] })],
    ['a page', (cert: Cert) => ({ ...cert, holders: [{ ...cert.holders[0], birth_year: { value: 1962, confidence: 0.9, page: 79062118340 } }] })],
    ['floors', (cert: Cert) => ({ ...cert, structures: [{ ...cert.structures[0], floors: leaf(79062118340) }] })],
    ['completed_year', (cert: Cert) => ({ ...cert, structures: [{ ...cert.structures[0], completed_year: leaf(79062118340) }] })],
    ['area_m2', (cert: Cert) => ({ ...cert, parcels: [{ ...cert.parcels[0], area_m2: leaf(1062118340) }] })],
  ])('rejects an ID number hidden in %s, because every number is bounded', (_field, hide) => {
    const withStructure = truths.find(({ truth }) => (truth.certificate as Cert).structures.length > 0)?.truth.certificate as Cert;
    expect(certificateV1Schema.safeParse(withStructure).success).toBe(true);
    expect(certificateV1Schema.safeParse(hide(withStructure)).success).toBe(false);
  });

  it('rejects an unknown form', () => {
    const first = truths[0]?.truth.certificate as Record<string, unknown>;
    expect(certificateV1Schema.safeParse({ ...first, form: leaf('so_trang') }).success).toBe(false);
  });

  it('reads a Vietnamese decimal comma area as a number', () => {
    const first = truths[0]?.truth.certificate as { parcels: Record<string, unknown>[] };
    const parsed = certificateV1Schema.parse({ ...first, parcels: [{ ...first.parcels[0], area_m2: leaf('1.250,5 m²') }] });
    expect(parsed.parcels[0]?.area_m2.value).toBe(1250.5);
  });
});
