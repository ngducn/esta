import { describe, expect, it } from 'vitest';
import { lintText } from './lint-text.ts';

const lint = async (code: string) => (await lintText('packages/db/src/scratch.ts', code)).map(({ ruleId }) => ruleId);

describe('packages/db boundary', () => {
  it.each([
    "import { x } from '@esta/core';\nexport type X = typeof x;\n",
    "import { y } from '../../ops/src/kit';\nexport type Y = typeof y;\n",
    "import { z } from '../core/src/index';\nexport type Z = typeof z;\n",
  ])('cannot import another workspace: %s', async (code) => {
    expect(await lint(code)).toContain('no-restricted-imports');
  });

  it.each([
    'export const PAGE = 1000;\n',
    'export function read() { return 1; }\n',
    "export { thing } from './thing';\n",
    "export * from './thing';\n",
    'const a = 1;\nexport default a;\n',
    'const a = 1;\nexport { a };\n',
  ])('exports nothing but types and the generated file: %s', async (code) => {
    expect(await lint(code)).toContain('no-restricted-syntax');
  });

  it.each([
    "export type { Database } from './database.types';\nexport { Constants } from './database.types';\n",
    "import type { Database } from './database.types';\nexport type Row = Database['public'];\n",
    'export interface Row { id: string }\n',
  ])('allows types and the generated file: %s', async (code) => {
    expect(await lint(code)).toEqual([]);
  });
});
