import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, it } from 'vitest';
import rule from './no-self-sourced-property.mjs';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({ languageOptions: { parser: tseslint.parser, sourceType: 'module' } });
const self = [{ messageId: 'selfSourced' }];

ruleTester.run('esta/no-self-sourced-property', rule, {
  valid: [
    "import fc from 'fast-check';\nimport { brand } from './brand';\nconst a = fc.constantFrom(...['a', 'b'].map(brand));",
    "import fc from 'fast-check';\nimport { brand } from './brand';\nconst a = fc.constantFrom(brand(1), brand(2));",
    "import fc from 'fast-check';\nconst a = fc.constantFrom('a', 'b');",
    "import fc from 'fast-check';\nconst BAD = ['a', 'b'];\nconst a = fc.constantFrom(...BAD);",
    "import fc from 'fast-check';\nimport { SPELLINGS } from './term.cases';\nconst a = fc.constantFrom(...SPELLINGS);",
    "import fc from 'fast-check';\nimport { SPELLINGS } from './shared.test';\nconst a = fc.constantFrom(...SPELLINGS);",
    "import fc from 'fast-check';\nimport { LIST } from './list';\nconst a = fc.string();",
    "import fc from 'fast-check';\nimport { LIST } from './list';\nconst a = fc.array(fc.string()).map((x) => LIST.length + x.length);",
    "import fc from 'fast-check';\nimport type { Kind } from './kinds';\nconst a = fc.constantFrom<Kind>('a', 'b');",
    "import fc from 'fast-check';\nconst a = fc.oneof(fc.constant(0), fc.integer());",
    "import fc from 'fast-check';\nconst a = (open: number[]) => fc.constantFrom(...open.map((n) => n + 1));",
  ],
  invalid: [
    { code: "import fc from 'fast-check';\nimport { LIST, brand } from './list';\nconst a = fc.constantFrom(...LIST.map((x) => brand(x)));", errors: self },
    { code: "import fc from 'fast-check';\nimport { LIST } from './list';\nconst a = fc.constantFrom(...LIST);", errors: self },
    { code: "import fc from 'fast-check';\nimport { LIST } from './list';\nconst a = fc.constantFrom(LIST[0], LIST[1]);", errors: [{ messageId: 'selfSourced' }, { messageId: 'selfSourced' }] },
    { code: "import fc from 'fast-check';\nimport { MAP } from './map';\nconst a = fc.constantFrom(...Object.values(MAP));", errors: self },
    { code: "import * as fc from 'fast-check';\nimport { LIST } from './list';\nconst a = fc.constantFrom(...LIST.map((x) => x.id));", errors: self },
    { code: "import fc from 'fast-check';\nimport { LIST } from './list';\nconst PICKS = LIST.filter(Boolean);\nconst a = fc.constantFrom(...PICKS);", errors: self },
    { code: "import fc from 'fast-check';\nimport { LIST } from './list';\nconst a = fc.subarray(LIST);", errors: self },
    { code: "import fc from 'fast-check';\nimport { LIST } from './list';\nconst a = fc.shuffledSubarray(LIST, { minLength: 1 });", errors: self },
    { code: "import fc from 'fast-check';\nimport { A } from './a';\nconst x = fc.oneof(fc.constant(A), fc.constant(0));", errors: self },
    { code: "import { constantFrom } from 'fast-check';\nimport { LIST } from '@esta/core';\nconst a = constantFrom(...LIST);", errors: self },
    { code: "import fc from 'fast-check';\nimport LIST from './list';\nconst a = fc.constantFrom(...LIST);", errors: self },
  ],
});
