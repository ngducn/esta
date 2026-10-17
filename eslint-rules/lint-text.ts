import { join } from 'node:path';
import { ESLint } from 'eslint';

export const repoRoot = join(import.meta.dirname, '..');
const eslint = new ESLint({ cwd: repoRoot });
// The first lint would load the flat config and its plugins inside a test's timeout (#51), so load them at import.
await eslint.calculateConfigForFile(join(repoRoot, 'eslint.config.mjs'));

export async function lintText(path: string, code: string) {
  const results = await eslint.lintText(code, { filePath: join(repoRoot, path) });
  return results.flatMap((result) => result.messages);
}
