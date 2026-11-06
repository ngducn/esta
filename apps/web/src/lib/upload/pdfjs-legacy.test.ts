import { globSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', '..');
const NON_LEGACY = /pdfjs-dist(?!\/legacy\/)[^'"]*['"]/u;

describe('pdf.js loads its legacy build (#262)', () => {
  it('imports pdfjs-dist only from legacy/build, which polyfills what an older browser lacks', () => {
    const offenders = globSync('**/*.{ts,tsx,mjs}', { cwd: SRC, exclude: (name) => name.endsWith('.test.ts') }).filter((path) => NON_LEGACY.test(readFileSync(join(SRC, path), 'utf8')));
    expect(offenders).toEqual([]);
  });
});
