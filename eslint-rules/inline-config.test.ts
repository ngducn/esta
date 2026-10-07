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

const webSources = () =>
  globSync('apps/web/**/*.{ts,tsx,js,mjs}', {
    cwd: repoRoot,
    exclude: ['**/node_modules/**', '**/.next/**', 'apps/web/src/app/dev/**'],
  });

const DISABLE_DIRECTIVE = /eslint-disable(?:-next-line|-line)?\s([^\n]*?)(?:\*\/|$)/gm;

const disablesCommentGuard = (source: string) =>
  [...source.matchAll(DISABLE_DIRECTIVE)].some(([, rules = '']) =>
    rules.split('--')[0]?.includes('eslint-comments/'),
  );

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

  it.each([
    '// eslint-disable-next-line @eslint-community/eslint-comments/no-restricted-disable -- bypass',
    '/* eslint-disable-next-line @eslint-community/eslint-comments/no-restricted-disable -- bypass */',
  ])('cannot switch off the eslint-comments guard for the next line: %s', async (guardOff) => {
    const code = `${guardOff}\n// eslint-disable-next-line esta/no-jsx-literals -- bypass\nexport const a = <p>Xin chào</p>;\n`;
    expect(await lint('apps/web/src/components/scratch.tsx', code)).toContainEqual({
      ruleId: '@eslint-community/eslint-comments/no-restricted-disable',
      severity: 2,
    });
  });

  it.each([
    ['/* eslint-disable @eslint-community/eslint-comments/no-restricted-disable -- bypass */', true],
    ['// eslint-disable-line @eslint-community/eslint-comments/require-description', true],
    ['/* eslint-disable react-hooks/purity, @eslint-community/eslint-comments/no-unlimited-disable */', true],
    ['// eslint-disable-next-line react-hooks/purity -- the roll changes on purpose', false],
  ])('finds a directive that names an eslint-comments rule: %s', (comment, found) => {
    expect(disablesCommentGuard(comment)).toBe(found);
  });

  it('has no directive outside /dev that switches off an eslint-comments guard, since a disable that covers its own line silences the guard that would report it', () => {
    const files = webSources();
    expect(files.length).toBeGreaterThan(0);
    expect(files.filter((path) => disablesCommentGuard(readFileSync(join(repoRoot, path), 'utf8')))).toEqual([]);
  });

  it('cannot switch off the browser Supabase client ban', async () => {
    const code =
      "// eslint-disable-next-line esta/no-browser-supabase-client -- bypass\nimport { createBrowserClient } from '@supabase/ssr';\nexport const c = createBrowserClient;\n";
    const messages = await lint('apps/web/src/components/supabase.ts', code);
    expect(messages).toContainEqual({ ruleId: '@eslint-community/eslint-comments/no-restricted-disable', severity: 2 });
    expect(messages).toContainEqual({ ruleId: 'esta/no-browser-supabase-client', severity: 2 });
  });

  it('requires a reason after -- on every inline disable', async () => {
    const path = 'apps/web/src/components/roll.tsx';
    expect(await lint(path, impureRender('// eslint-disable-next-line react-hooks/purity'))).toContainEqual({
      ruleId: '@eslint-community/eslint-comments/require-description',
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
    const files = webSources();
    expect(files.length).toBeGreaterThan(0);
    expect(files.filter((path) => /\/\*\s*eslint\s/.test(readFileSync(join(repoRoot, path), 'utf8')))).toEqual([]);
  });

  it('still honors inline config under apps/web/src/app/dev', async () => {
    const code = '// eslint-disable-next-line @typescript-eslint/no-explicit-any\nexport const a: any = 1;\n';
    expect(await lint('apps/web/src/app/dev/scratch.tsx', code)).toEqual([]);
  });
});
