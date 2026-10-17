import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { certificateV1Schema } from './certificate_v1';

const FIXTURES = join(import.meta.dirname, '../../../../fixtures/certificates');

const truths = readdirSync(FIXTURES, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== 'generator')
  .map((entry) => ({ id: entry.name, truth: JSON.parse(readFileSync(join(FIXTURES, entry.name, 'truth.json'), 'utf8')) as { certificate: unknown } }));

const leaf = (value: unknown) => ({ value, confidence: 0.95, page: 1 });

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
