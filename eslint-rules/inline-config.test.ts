import { globSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const repoRoot = join(import.meta.dirname, '..');
const eslint = new ESLint({ cwd: repoRoot });

async function lint(path: string, code: string) {
  const results = await eslint.lintText(code, { filePath: join(repoRoot, path) });
  return results.flatMap((result) => result.messages.map(({ ruleId, severity }) => ({ ruleId, severity })));
}

const impureRender = (disable: string) =>
  `export function Roll() {\n  ${disable}\n  const n = Math.random();\n  return <p>{n}</p>;\n}\n`;

describe('inline eslint config in apps/web', () => {
  it.each([
    ['// eslint-disable-next-line esta/no-jsx-literals\nexport const a = <p>Xin chào</p>;\n', 'no-restricted-disable'],
    ['export const a = <p>Xin chào</p>; // eslint-disable-line esta/no-jsx-literals\n', 'no-restricted-disable'],
    ['/* eslint-disable esta/no-jsx-literals */\nexport const a = <p>Xin chào</p>;\n', 'no-restricted-disable'],
    ['/* eslint-disable */\nexport const a = <p>Xin chào</p>;\n', 'no-unlimited-disable'],
  ])('cannot switch off esta rules outside /dev: %s', async (code, rule) => {
    expect(await lint('apps/web/src/components/scratch.tsx', code)).toContainEqual({
      ruleId: `@eslint-community/eslint-comments/${rule}`,
      severity: 2,
    });
  });

  it('honors an inline disable of a react-hooks rule with a reason', async () => {
    const path = 'apps/web/src/components/roll.tsx';
    expect(await lint(path, impureRender(''))).toContainEqual({ ruleId: 'react-hooks/purity', severity: 2 });
    const disable = '// eslint-disable-next-line react-hooks/purity -- the roll is meant to change on every render';
    expect(await lint(path, impureRender(disable))).toEqual([]);
  });

  it('has no /* eslint */ rule config comment outside /dev, since a lint rule cannot catch one that turns it off', () => {
    const files = globSync('apps/web/**/*.{ts,tsx,js,mjs}', {
      cwd: repoRoot,
      exclude: ['**/node_modules/**', '**/.next/**', 'apps/web/src/app/dev/**'],
    });
    expect(files.length).toBeGreaterThan(0);
    expect(files.filter((path) => /\/\*\s*eslint\s/.test(readFileSync(join(repoRoot, path), 'utf8')))).toEqual([]);
  });

  it('still honors inline config under apps/web/src/app/dev', async () => {
    const code = '// eslint-disable-next-line @typescript-eslint/no-explicit-any\nexport const a: any = 1;\n';
    expect(await lint('apps/web/src/app/dev/scratch.tsx', code)).toEqual([]);
  });
});
