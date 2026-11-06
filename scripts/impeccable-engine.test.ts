import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');

type Pin = { readonly digest: string; readonly path: string };

/** `sha256sum` lines: a 64-hex digest, two spaces, a path. */
function parsePins(text: string): Pin[] {
  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const match = /^([0-9a-f]{64}) {2}(\S.*)$/.exec(line);
      if (match?.[1] === undefined || match[2] === undefined) throw new Error(`not a sha256sum line: ${line}`);
      return { digest: match[1], path: match[2] };
    });
}

/** The pinned paths whose bytes do not hash to their digest. */
function digestMismatches(pins: readonly Pin[], read: (path: string) => Buffer): string[] {
  return pins.filter((pin) => createHash('sha256').update(read(pin.path)).digest('hex') !== pin.digest).map((pin) => pin.path);
}

const DARWIN_BINARY = '.claude/skills/impeccable/scripts/bin/darwin-arm64/impeccable';
const pins = parsePins(readFileSync(join(root, '.github/impeccable-darwin.sha256'), 'utf8'));

describe('the macOS Impeccable engine committed under the skill', () => {
  it('has a pinned digest', () => {
    expect(pins.map((pin) => pin.path)).toEqual([DARWIN_BINARY]);
  });

  it('is the binary the digest names', () => {
    expect(digestMismatches(pins, (path) => readFileSync(join(root, path)))).toEqual([]);
  });

  it('fails when one byte of the binary differs', () => {
    const bytes = readFileSync(join(root, DARWIN_BINARY));
    const changed = Buffer.from(bytes);
    changed[0] = (changed[0] ?? 0) ^ 1;
    expect(digestMismatches(pins, () => changed)).toEqual([DARWIN_BINARY]);
  });

  it('refuses a pin file that is not sha256sum lines', () => {
    expect(() => parsePins('abc  file')).toThrow();
  });
});
