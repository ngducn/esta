import { join } from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const repoRoot = join(import.meta.dirname, '..', '..', '..');
const eslint = new ESLint({ cwd: repoRoot });

async function restrictedRules(code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: join(repoRoot, 'supabase/seed/generator/scratch.ts') });
  return (result?.messages ?? []).flatMap(({ ruleId }) => (ruleId?.startsWith('no-restricted-') ? [ruleId] : []));
}

describe('generator lint', () => {
  it.each([
    'export const a = Math.random();',
    'export const a = Date.now();',
    'export const a = new Date();',
    'export const a = Date();',
    'export const a = crypto.randomUUID();',
    'export const a = crypto.getRandomValues(new Uint8Array(4));',
    'export const a = performance.now();',
    "import { randomUUID } from 'node:crypto';\nexport const a = randomUUID();",
    "import { randomBytes } from 'crypto';\nexport const a = randomBytes(4);",
  ])('bans a nondeterministic source: %s', async (code) => {
    expect(await restrictedRules(code)).toHaveLength(1);
  });

  it('allows the hashing and fixed dates the generator uses', async () => {
    expect(
      await restrictedRules("import { createHash } from 'node:crypto';\nexport const a = [createHash('sha1'), new Date('2026-10-07T02:00:00Z')];"),
    ).toEqual([]);
  });
});
