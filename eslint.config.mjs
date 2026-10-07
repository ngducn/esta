import eslintComments from '@eslint-community/eslint-plugin-eslint-comments';
import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';
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
    files: ['apps/web/**/*.{ts,tsx}'],
    extends: [nextPlugin.configs['core-web-vitals'], reactHooks.configs.flat.recommended],
    rules: { '@next/next/no-html-link-for-pages': 'off' },
  },
  {
    ignores: ['eslint-rules/**'],
    plugins: { esta: { rules: { 'service-role-allowlist': serviceRoleAllowlist, 'no-jsx-literals': noJsxLiterals } } },
    rules: { 'esta/service-role-allowlist': 'error' },
  },
  {
    files: ['apps/web/**/*.tsx'],
    rules: { 'esta/no-jsx-literals': 'error' },
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
      ],
      'no-restricted-imports': [
        'error',
        ...['crypto', 'node:crypto'].map((name) => ({
          name,
          importNames: ['randomUUID', 'randomBytes', 'randomInt', 'randomFillSync', 'getRandomValues', 'webcrypto'],
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
    files: ['apps/web/**'],
    ignores: ['apps/web/src/app/dev/**'],
    plugins: { '@eslint-community/eslint-comments': eslintComments },
    rules: {
      '@eslint-community/eslint-comments/no-restricted-disable': ['error', 'esta/*'],
      '@eslint-community/eslint-comments/no-unlimited-disable': 'error',
    },
  },
);
