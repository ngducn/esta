import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, it } from 'vitest';
import rule from './no-untyped-action-params.mjs';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({ languageOptions: { parser: tseslint.parser } });
const untyped = [{ messageId: 'untyped' }];

ruleTester.run('esta/no-untyped-action-params', rule, {
  valid: [
    "'use server';\nexport async function restoreUnit(deleted: { id: string }): Promise<{ ok: boolean }> { return { ok: true }; }",
    "'use server';\nexport async function save(raw: unknown) { return raw; }",
    "'use server';\ntype Trashed = { readonly id: string };\nexport async function restore(deleted: Trashed) { return deleted; }",
    "export async function helper(row: Record<string, unknown>) { return row; }",
    "'use server';\nasync function internal(row: Record<string, unknown>) { return row; }\nexport async function run() { return internal({}); }",
    "'use server';\nexport async function save(row: Record<string, string>) { return row; }",
  ],
  invalid: [
    { code: "'use server';\nexport async function restore(row: Record<string, unknown>) { return row; }", errors: untyped },
    { code: "'use server';\nexport const restore = async (row: { id: string } & Record<string, unknown>) => row;", errors: untyped },
    { code: "'use server';\ntype Deleted = { readonly row: { id: string } & Record<string, unknown> };\nexport async function restore(deleted: Deleted) { return deleted; }", errors: untyped },
    { code: "'use server';\ntype Deleted = { readonly row: { [key: string]: unknown } };\nexport async function restore(deleted: Deleted) { return deleted; }", errors: untyped },
    { code: "'use server';\ntype Deleted = { readonly row: Record<string, unknown> };\ntype Gone = Result<Deleted>;\nexport async function remove(): Promise<Gone> { throw new Error('x'); }", errors: untyped },
  ],
});
