import { globSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { lintText, repoRoot } from './lint-text.ts';

async function lint(path: string, code: string) {
  return (await lintText(path, code)).map(({ ruleId, severity }) => ({ ruleId, severity }));
}

const webSources = () =>
  globSync('apps/web/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}', {
    cwd: repoRoot,
    exclude: ['**/node_modules/**', '**/.next/**', 'apps/web/src/app/dev/**'],
  });

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

  const guardOffAndEstaOff = (disableGuard: string) =>
    `${disableGuard}\n// eslint-disable-next-line esta/no-jsx-literals -- bypass\nexport const a = <p>Xin chào</p>;\n`;

  it.each([
    ['one-line block', guardOffAndEstaOff('/* eslint-disable @eslint-community/eslint-comments/no-restricted-disable -- bypass */')],
    [
      'block with the rule on a later line',
      guardOffAndEstaOff('/* eslint-disable\n\n  @eslint-community/eslint-comments/no-restricted-disable -- bypass */'),
    ],
    [
      'block whose rule list continues on the next line',
      guardOffAndEstaOff('/* eslint-disable react-hooks/purity,\n  @eslint-community/eslint-comments/no-restricted-disable -- bypass */'),
    ],
    [
      'same-line directive that also names the esta rule',
      'export const a = <p>Xin chào</p>; // eslint-disable-line esta/no-jsx-literals, @eslint-community/eslint-comments/no-restricted-disable -- bypass\n',
    ],
    [
      'block that also names the guard rule itself',
      guardOffAndEstaOff('/* eslint-disable esta/no-guard-disable, @eslint-community/eslint-comments/no-restricted-disable -- bypass */'),
    ],
    [
      'same-line directive that also names the guard rule itself',
      'export const a = <p>Xin chào</p>; // eslint-disable-line esta/no-jsx-literals, esta/no-guard-disable, @eslint-community/eslint-comments/no-restricted-disable -- bypass\n',
    ],
  ])('fails lint on a directive that names an eslint-comments rule, since it silences the guard that would report it: %s', async (_, code) => {
    expect(await lint('apps/web/src/components/scratch.tsx', code)).toContainEqual({
      ruleId: 'esta/no-guard-disable',
      severity: 2,
    });
  });

  const lintedExtensions = ['ts', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs'];

  it.each(lintedExtensions)('fails lint on a directive that names an eslint-comments rule in a .%s file', async (ext) => {
    const code = '/* eslint-disable @eslint-community/eslint-comments/no-restricted-disable -- bypass */\nconst a = 1;\n';
    expect(await lint(`apps/web/src/lib/scratch.${ext}`, code)).toContainEqual({
      ruleId: 'esta/no-guard-disable',
      severity: 2,
    });
  });

  it.each(lintedExtensions)('bans the browser Supabase client in a .%s file', async (ext) => {
    const code = "const ssr = require('@supabase/ssr');\nconst c = ssr.createBrowserClient;\n";
    expect(await lint(`apps/web/src/lib/scratch.${ext}`, code)).toContainEqual({
      ruleId: 'esta/no-browser-supabase-client',
      severity: 2,
    });
  });

  it('applies the JSX literal rule and its guard to a .jsx file, which Next serves as a page', async () => {
    expect(await lint('apps/web/src/components/scratch.jsx', 'export const a = <p>Xin chào</p>;\n')).toContainEqual({
      ruleId: 'esta/no-jsx-literals',
      severity: 2,
    });
    const disabled = '// eslint-disable-next-line esta/no-jsx-literals -- bypass\nexport const a = <p>Xin chào</p>;\n';
    expect(await lint('apps/web/src/components/scratch.jsx', disabled)).toContainEqual({
      ruleId: '@eslint-community/eslint-comments/no-restricted-disable',
      severity: 2,
    });
  });

  it.each(['packages/core/src/scratch.ts', 'apps/agent/src/scratch.ts', 'scripts/scratch.ts'])(
    'cannot switch off an esta rule in %s either',
    async (path) => {
      const code = "// eslint-disable-next-line esta/service-role-allowlist -- bypass\nexport const key = process.env.SUPABASE_SERVICE_ROLE_KEY;\n";
      expect(await lint(path, code)).toContainEqual({ ruleId: '@eslint-community/eslint-comments/no-restricted-disable', severity: 2 });
    },
  );

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
