import { join } from 'node:path';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, it } from 'vitest';
import rule from './service-role-allowlist.mjs';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const repoRoot = join(import.meta.dirname, '..');
const at = (path: string) => join(repoRoot, path);
const ruleTester = new RuleTester({ languageOptions: { parser: tseslint.parser } });

const readsKey = 'export const key = process.env.SUPABASE_SERVICE_ROLE_KEY;';
const forbidden = [{ messageId: 'forbidden' }];

ruleTester.run('esta/service-role-allowlist', rule, {
  valid: [
    { filename: at('apps/agent/src/supabase.ts'), code: readsKey },
    { filename: at('scripts/seed-storage.ts'), code: readsKey },
    { filename: at('apps/web/src/server/cron/supabase.ts'), code: readsKey },
    { filename: at('apps/web/src/app/page.tsx'), code: 'export const url = process.env.NEXT_PUBLIC_SUPABASE_URL;' },
  ],
  invalid: [
    { filename: at('apps/web/src/app/x.ts'), code: readsKey, errors: forbidden },
    { filename: at('packages/core/src/x.ts'), code: readsKey, errors: forbidden },
    { filename: at('apps/web/src/server/env.ts'), code: "export const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];", errors: forbidden },
    { filename: at('apps/web/src/app/y.ts'), code: 'const { SUPABASE_SERVICE_ROLE_KEY } = process.env;', errors: forbidden },
    { filename: at('apps/web/src/server/cronjobs/x.ts'), code: readsKey, errors: forbidden },
  ],
});
