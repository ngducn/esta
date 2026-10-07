import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, it } from 'vitest';
import rule from './no-browser-supabase-client.mjs';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({ languageOptions: { parser: tseslint.parser } });
const factory = [{ messageId: 'factory' }];
const clientImport = [{ messageId: 'clientImport' }];

ruleTester.run('esta/no-browser-supabase-client', rule, {
  valid: [
    "import { createServerClient } from '@supabase/ssr';",
    "import { createClient } from '@supabase/supabase-js';",
    "'use client';\nimport type { CookieOptions } from '@supabase/ssr';",
    "'use client';\nimport { useState } from 'react';",
  ],
  invalid: [
    { code: "import { createBrowserClient } from '@supabase/ssr';", errors: factory },
    { code: "import { createBrowserClient as make } from '@supabase/ssr';", errors: factory },
    { code: "import * as ssr from '@supabase/ssr';\nexport const c = ssr.createBrowserClient('u', 'k');", errors: factory },
    { code: "import * as ssr from '@supabase/ssr';\nexport const c = ssr['createBrowserClient']('u', 'k');", errors: factory },
    { code: "export const c = (await import('@supabase/ssr')).createBrowserClient;", errors: factory },
    { code: "export { createBrowserClient } from '@supabase/ssr';", errors: factory },
    { code: "'use client';\nimport { createClient } from '@supabase/supabase-js';", errors: clientImport },
    { code: "'use client';\nimport { createServerClient } from '@supabase/ssr';", errors: clientImport },
    { code: "'use client';\nexport const m = () => import('@supabase/supabase-js');", errors: clientImport },
    { code: "'use client';\nexport * from '@supabase/ssr';", errors: clientImport },
  ],
});
