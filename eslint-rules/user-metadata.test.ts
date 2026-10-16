import { join } from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const repoRoot = join(import.meta.dirname, '..');
const eslint = new ESLint({ cwd: repoRoot });

async function ruleIds(path: string, code: string) {
  const [result] = await eslint.lintText(code, { filePath: join(repoRoot, path) });
  return (result?.messages ?? []).map((message) => message.ruleId);
}

describe('user_metadata never feeds the app (#23)', () => {
  it.each([
    [
      'apps/web/src/server/scratch.ts',
      'export const name = (user: { user_metadata: { name: string } }) => user.user_metadata.name;\n',
      'no-restricted-properties',
    ],
    ['apps/agent/src/scratch.ts', "export const name = (claims: Record<string, unknown>) => claims['raw_user_meta_data'];\n", 'no-restricted-syntax'],
    ['packages/core/src/scratch.ts', "export const columns = 'id, raw_user_meta_data';\n", 'no-restricted-syntax'],
  ])('%s is refused', async (path, code, rule) => {
    expect(await ruleIds(path, code)).toContain(rule);
  });

  it('allows the household_members display name', async () => {
    expect(await ruleIds('apps/web/src/server/scratch.ts', "export const columns = 'id, display_name, locale';\n")).toEqual([]);
  });
});
