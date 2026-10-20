import eslintComments from '@eslint-community/eslint-plugin-eslint-comments';
import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';
import noBrowserSupabaseClient from './eslint-rules/no-browser-supabase-client.mjs';
import noGuardDisable from './eslint-rules/no-guard-disable.mjs';
import noJsxLiterals from './eslint-rules/no-jsx-literals.mjs';
import serviceRoleAllowlist from './eslint-rules/service-role-allowlist.mjs';

export default defineConfig(
  globalIgnores([
    '**/.next/',
    '**/next-env.d.ts',
    '.claude/',
    'playwright-report/',
    'test-results/',
    'supabase/.slots/',
    'apps/web/src/lib/cn-tables.ts',
  ]),
  js.configs.recommended,
  tseslint.configs.strict,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^_', argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: { Buffer: 'readonly', URL: 'readonly', console: 'readonly', process: 'readonly' } },
  },
  {
    files: ['apps/web/**/*.{ts,tsx,jsx}'],
    extends: [nextPlugin.configs['core-web-vitals'], reactHooks.configs.flat.recommended],
    rules: { '@next/next/no-html-link-for-pages': 'off' },
  },
  {
    // The receipt preview is a blob URL of the photo picked in this tab, which next/image cannot load.
    files: ['apps/web/src/components/expenses/expense-sheet.tsx'],
    rules: { '@next/next/no-img-element': 'off' },
  },
  {
    // satori draws the receipt and shared QR pictures from plain elements on the server; next/image never reaches them.
    files: ['apps/web/src/server/receipts/png.tsx', 'apps/web/src/server/invoices/shared-qr.tsx'],
    rules: { '@next/next/no-img-element': 'off' },
  },
  {
    ignores: ['eslint-rules/**'],
    plugins: {
      esta: {
        rules: {
          'service-role-allowlist': serviceRoleAllowlist,
          'no-jsx-literals': noJsxLiterals,
          'no-browser-supabase-client': noBrowserSupabaseClient,
          'no-guard-disable': noGuardDisable,
        },
      },
    },
    rules: { 'esta/service-role-allowlist': 'error' },
  },
  {
    files: ['apps/web/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'],
    rules: { 'esta/no-browser-supabase-client': 'error' },
  },
  {
    files: ['apps/web/**/*.{tsx,jsx}'],
    // Tests pass fixture text such as an address or a label as props; it never reaches a user.
    ignores: ['apps/web/**/*.test.{tsx,jsx}'],
    rules: { 'esta/no-jsx-literals': 'error' },
  },
  {
    files: ['apps/**/*.{ts,tsx}', 'packages/**/*.ts'],
    rules: {
      // Whoever signs up first for an address can set user_metadata, and it survives the owner's code (#23).
      'no-restricted-properties': [
        'error',
        { property: 'user_metadata', message: 'Read names and settings from household_members, never from user_metadata.' },
        { property: 'raw_user_meta_data', message: 'Read names and settings from household_members, never from user_metadata.' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/user_meta/]',
          message: 'Read names and settings from household_members, never from user_metadata.',
        },
      ],
    },
  },
  {
    files: ['supabase/seed/generator/**'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Seed data is deterministic: draw from rngFor(scope).' },
        { object: 'Date', property: 'now', message: 'Seed timestamps come from --as-of (ctx.asOf).' },
        { object: 'performance', property: 'now', message: 'Seed timestamps come from --as-of (ctx.asOf).' },
        { object: 'crypto', property: 'randomUUID', message: 'Seed ids come from seedId(key).' },
        { object: 'crypto', property: 'getRandomValues', message: 'Seed data is deterministic: draw from rngFor(scope).' },
        { object: 'globalThis', property: 'crypto', message: 'Seed data is deterministic: ids come from seedId(key), draws from rngFor(scope).' },
        { object: 'process', property: 'hrtime', message: 'Seed timestamps come from --as-of (ctx.asOf).' },
      ],
      'no-restricted-imports': [
        'error',
        ...['crypto', 'node:crypto'].map((name) => ({
          name,
          importNames: ['default', 'randomUUID', 'randomBytes', 'randomInt', 'randomFillSync', 'getRandomValues', 'webcrypto'],
          message: 'Seed data is deterministic: ids come from seedId(key), draws from rngFor(scope).',
        })),
      ],
      'no-restricted-syntax': [
        'error',
        { selector: 'NewExpression[callee.name="Date"][arguments.length=0]', message: 'Seed timestamps come from --as-of (ctx.asOf).' },
        { selector: 'CallExpression[callee.name="Date"]', message: 'Seed timestamps come from --as-of (ctx.asOf).' },
      ],
    },
  },
  {
    // The esta rules are not registered for eslint-rules/, which holds their sources and tests.
    ignores: ['apps/web/src/app/dev/**', 'eslint-rules/**'],
    plugins: { '@eslint-community/eslint-comments': eslintComments },
    rules: {
      '@eslint-community/eslint-comments/no-restricted-disable': ['error', 'esta/*', '@eslint-community/eslint-comments/*'],
      '@eslint-community/eslint-comments/no-unlimited-disable': 'error',
      '@eslint-community/eslint-comments/require-description': 'error',
      'esta/no-guard-disable': 'error',
    },
  },
);
