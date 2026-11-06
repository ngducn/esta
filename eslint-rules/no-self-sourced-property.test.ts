import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, it } from 'vitest';
import rule from './no-self-sourced-property.mjs';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({ languageOptions: { parser: tseslint.parser, sourceType: 'module' } });
const self = [{ messageId: 'selfSourced' }];
const mirroredCases = [{ messageId: 'mirroredCases' }];

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
    "import fc from 'fast-check';\nimport { LIST } from './list';\nconst a = fc.integer({ min: 0, max: 9 }).map((i) => i + LIST.length);",
    "import fc from 'fast-check';\nconst LIST = ['a'];\nconst a = fc.integer({ max: LIST.length - 1 }).map((i) => LIST[i]);",
    "import fc from 'fast-check';\nimport { LIST } from './list';\nconst a = [1].map((i) => LIST[i]);",
    "import fc from 'fast-check';\nimport { build } from './build';\nconst a = fc.constantFrom(build(1), build(2));",
    "import fc from 'fast-check';\nimport { CASES } from './term.cases';\nimport { LIST } from './list';\nit('x', () => expect(LIST.length).toBe(CASES.length));\nconst a = fc.constantFrom(...CASES);",
    "import fc from 'fast-check';\nimport { CASES } from './term.cases';\nimport { LIST } from './list';\nit('x', () => expect(CASES).toEqual(['a']));\nit('y', () => expect(LIST).toEqual(['b']));\nconst a = fc.constantFrom(...CASES);",
  ],
  invalid: [
    { code: "import fc from 'fast-check';\nimport { allSpellings } from './list';\nconst a = fc.constantFrom(...allSpellings());", errors: self },
    { code: "import fc from 'fast-check';\nimport { LIST } from './list';\nconst pick = () => LIST;\nconst a = fc.constantFrom(...pick());", errors: self },
    { code: "import fc from 'fast-check';\nimport { LIST } from './list';\nconst a = fc.integer({ max: LIST.length - 1 }).map((i) => LIST[i]);", errors: self },
    { code: "import fc from 'fast-check';\nimport { LIST } from './list';\nconst a = fc.nat(5).chain((i) => fc.constant(LIST[i]));", errors: self },
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
    { code: "import fc from 'fast-check';\nimport { CASES } from './term.cases';\nimport { LIST } from './list';\nit('x', () => expect(CASES).toEqual(LIST));\nconst a = fc.constantFrom(...CASES);", errors: mirroredCases },
    { code: "import fc from 'fast-check';\nimport { CASES } from './term.cases';\nimport { LIST } from './list';\nit('x', () => expect(LIST.map((x) => x.id)).toStrictEqual(CASES));\nconst PICKS = CASES.filter(Boolean);\nconst a = fc.constantFrom(...PICKS);", errors: mirroredCases },
    { code: "import fc from 'fast-check';\nimport assert from 'node:assert';\nimport { CASES } from './term.cases';\nimport { LIST } from './list';\nassert.deepEqual(CASES, LIST);\nconst a = fc.subarray(CASES);", errors: mirroredCases },
    { code: "import fc from 'fast-check';\nimport LIST from './list';\nconst a = fc.constantFrom(...LIST);", errors: self },
  ],
});
