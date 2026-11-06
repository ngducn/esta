import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', '..');
const ANY_PDFJS = /pdfjs-dist(?!\/legacy\/)[^'"]*['"]/u;

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.(?:tsx?|mjs)$/u.test(entry.name) && !entry.name.endsWith('.test.ts') ? [path] : [];
  });
}

describe('pdf.js loads its legacy build (#262)', () => {
  it('imports pdfjs-dist only from legacy/build, which polyfills what an older browser lacks', () => {
    const offenders = sources(SRC).filter((path) => ANY_PDFJS.test(readFileSync(path, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
