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
);
