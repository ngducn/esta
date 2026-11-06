import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');
const fixtures = join(root, 'supabase', 'tests', 'fixtures');
const guards = new Set(['scripts/pgtap-fixtures.test.ts', 'scripts/shared-vectors.test.ts']);

const tracked = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '*.test.ts', '*.test.tsx', 'supabase/tests/*.test.sql'], { cwd: root, encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);
const readers = (file: string, matches: (path: string) => boolean) =>
  tracked.filter((path) => matches(path) && !guards.has(path) && readFileSync(join(root, path), 'utf8').includes(`fixtures/${file}`));

describe('shared vector files', () => {
  it.each(readdirSync(fixtures).filter((file) => file.endsWith('.csv')))('%s is read by a TypeScript test and a pgTAP file', (file) => {
    expect({ typescript: readers(file, (path) => !path.endsWith('.sql')).length > 0, pgtap: readers(file, (path) => path.endsWith('.sql')).length > 0 }).toEqual({
      typescript: true,
      pgtap: true,
    });
  });
});
