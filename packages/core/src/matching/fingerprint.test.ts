import { createHash } from 'node:crypto';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { isoDate } from '../date/iso-date';
import { vnd } from '../money/vnd';
import { identifyRows, sha256Hex } from './fingerprint';

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

describe('identifyRows', () => {
  const referenced = { date: isoDate('2026-10-07'), amount: vnd(3_500_000), bankRef: 'FT26280001', description: 'MBVCB.1234567.ESTA7K2QX9MP.CT TU 0903' };
  const unreferenced = { ...referenced, bankRef: '' };
  const fingerprintOf = (row: typeof referenced): string => identifyRows([row])[0]?.fingerprint as string;

  it('hashes ref, date, amount and bank reference, newline separated, when the row has a reference', () => {
    expect(fingerprintOf(referenced)).toBe(nodeSha256('ref\n2026-10-07\n3500000\nFT26280001'));
  });

  it('hashes row, date, amount, the normalized description and the occurrence when it has none', () => {
    expect(identifyRows([unreferenced, unreferenced]).map((identity) => identity.fingerprint)).toEqual([
      nodeSha256('row\n2026-10-07\n3500000\nMBVCB1234567ESTA7K2QX9MPCTTU0903\n1'),
      nodeSha256('row\n2026-10-07\n3500000\nMBVCB1234567ESTA7K2QX9MPCTTU0903\n2'),
    ]);
  });

  it.each([
    ['date', { date: isoDate('2026-10-08') }],
    ['amount', { amount: vnd(3_500_001) }],
    ['bank reference', { bankRef: 'FT26280002' }],
  ])('changes with the %s of a referenced row', (_field, change) => {
    expect(fingerprintOf({ ...referenced, ...change })).not.toBe(fingerprintOf(referenced));
  });

  it.each([
    ['date', { date: isoDate('2026-10-08') }],
    ['amount', { amount: vnd(3_500_001) }],
    ['description', { description: 'MBVCB.1234567.ESTA7K2QX9MP.CT TU 0904' }],
  ])('changes with the %s of an unreferenced row', (_field, change) => {
    expect(fingerprintOf({ ...unreferenced, ...change })).not.toBe(fingerprintOf(unreferenced));
  });

  it('ignores the description of a referenced row and the spacing, case and punctuation of an unreferenced one', () => {
    expect(fingerprintOf({ ...referenced, description: 'CT TU 0903' })).toBe(fingerprintOf(referenced));
    expect(fingerprintOf({ ...unreferenced, description: 'mbvcb 1234567 esta 7k2qx9mp ct tu 0903' })).toBe(fingerprintOf(unreferenced));
  });

  it('is unchanged by the row index', () => {
    expect(fingerprintOf({ ...referenced, index: 7 } as typeof referenced)).toBe(fingerprintOf(referenced));
  });

  it('points each repeat at the first copy, as the same transfer when referenced and as an identical row when not', () => {
    const other = { ...unreferenced, amount: vnd(4_200_000) };
    const copies = identifyRows([referenced, unreferenced, other, referenced, { ...unreferenced, description: 'mbvcb 1234567 esta7k2qx9mp ct tu 0903' }]);
    expect(copies.map(({ fingerprint: _fingerprint, ...copy }) => copy)).toEqual([
      { copy: 'first' },
      { copy: 'first' },
      { copy: 'first' },
      { copy: 'same_reference', of: 0 },
      { copy: 'identical', of: 1 },
    ]);
    expect(copies[3]?.fingerprint).toBe(copies[0]?.fingerprint);
    expect(new Set(copies.map((identity) => identity.fingerprint)).size).toBe(4);
  });

  it('gives the same file the same fingerprints every time', () => {
    const file = [referenced, unreferenced, unreferenced];
    expect(identifyRows(file)).toEqual(identifyRows(file));
  });
});
