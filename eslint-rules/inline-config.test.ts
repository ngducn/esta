import { join } from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const repoRoot = join(import.meta.dirname, '..');
const eslint = new ESLint({ cwd: repoRoot });

async function lint(path: string, code: string) {
  const results = await eslint.lintText(code, { filePath: join(repoRoot, path) });
  return results.flatMap((result) => result.messages.map(({ ruleId, severity, message }) => ({ ruleId, severity, message })));
}

describe('inline eslint config in apps/web', () => {
  it.each([
    '// eslint-disable-next-line esta/no-jsx-literals\nexport const a = <p>Xin chào</p>;\n',
    '/* eslint-disable */\nexport const a = <p>Xin chào</p>;\n',
    'export const a = <p>Xin chào</p>; // eslint-disable-line esta/no-jsx-literals\n',
  ])('cannot switch off esta/no-jsx-literals outside /dev: %s', async (code) => {
    const messages = await lint('apps/web/src/app/scratch.tsx', code);
    expect(messages).toContainEqual(expect.objectContaining({ ruleId: 'esta/no-jsx-literals', severity: 2 }));
    expect(messages).toContainEqual(expect.objectContaining({ ruleId: null, message: expect.stringMatching(/noInlineConfig/) }));
  });

  it('still honors inline config under apps/web/src/app/dev', async () => {
    const code = '// eslint-disable-next-line @typescript-eslint/no-explicit-any\nexport const a: any = 1;\n';
    expect(await lint('apps/web/src/app/dev/scratch.tsx', code)).toEqual([]);
  });
});
