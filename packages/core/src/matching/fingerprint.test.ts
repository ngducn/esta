import { createHash } from 'node:crypto';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { isoDate } from '../date/iso-date';
import { vnd } from '../money/vnd';
import { rowFingerprint, rowFingerprints, sha256Hex } from './fingerprint';

const nodeSha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

describe('sha256Hex', () => {
  it.each([
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    ['abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq', '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'],
  ])('matches the FIPS 180-4 vector for %j', (text, digest) => {
    expect(sha256Hex(text)).toBe(digest);
  });

  it('agrees with node:crypto on random text, including block boundaries and non-ASCII', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'grapheme', maxLength: 300 }), (text) => {
        expect(sha256Hex(text)).toBe(nodeSha256(text));
      }),
      { seed: 20261007, numRuns: 500 },
    );
    for (const length of [55, 56, 63, 64, 65, 119, 120, 128]) {
      const text = 'a'.repeat(length);
      expect(sha256Hex(text), `length ${length}`).toBe(nodeSha256(text));
    }
  });
});

describe('rowFingerprint', () => {
  const row = { date: isoDate('2026-10-07'), amount: vnd(3_500_000), bankRef: 'FT26280001', description: 'MBVCB.1234567.ESTA7K2QX9MP.CT TU 0903' };

  it('is the SHA-256 of date, amount, bank reference, the normalized description and the occurrence, newline separated', () => {
    expect(rowFingerprint(row)).toBe(nodeSha256('2026-10-07\n3500000\nFT26280001\nMBVCB1234567ESTA7K2QX9MPCTTU0903\n1'));
    expect(rowFingerprint(row, 2)).toBe(nodeSha256('2026-10-07\n3500000\nFT26280001\nMBVCB1234567ESTA7K2QX9MPCTTU0903\n2'));
  });

  it('ignores spacing, case and punctuation differences in the description', () => {
    expect(rowFingerprint({ ...row, description: 'mbvcb 1234567 esta 7k2qx9mp ct tu 0903' })).toBe(rowFingerprint(row));
  });

  it.each([
    ['date', { date: isoDate('2026-10-08') }],
    ['amount', { amount: vnd(3_500_001) }],
    ['bank reference', { bankRef: 'FT26280002' }],
    ['description', { description: 'MBVCB.1234567.ESTA7K2QX9MP.CT TU 0904' }],
  ])('changes when the %s changes', (_field, change) => {
    expect(rowFingerprint({ ...row, ...change })).not.toBe(rowFingerprint(row));
  });

  it('is unchanged by the row index', () => {
    const indexed = { ...row, index: 7 };
    expect(rowFingerprint(indexed)).toBe(rowFingerprint(row));
  });
});

describe('rowFingerprints', () => {
  const first = { date: isoDate('2026-10-07'), amount: vnd(3_500_000), bankRef: '', description: 'ESTA 7K2QX9MP' };
  const other = { ...first, amount: vnd(4_200_000) };

  it('counts identical rows, so two identical transfers in one file get two fingerprints', () => {
    expect(rowFingerprints([first, other, { ...first, description: 'esta 7k2qx9mp' }, first])).toEqual([
      rowFingerprint(first, 1),
      rowFingerprint(other, 1),
      rowFingerprint(first, 2),
      rowFingerprint(first, 3),
    ]);
  });

  it('gives the same file the same fingerprints every time', () => {
    const file = [first, other, first];
    expect(rowFingerprints(file)).toEqual(rowFingerprints(file));
  });
});
