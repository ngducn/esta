import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { parseEnv } from './src/server/env-schema';

const env = parseEnv(process.env);

const nextConfig: NextConfig = {
  distDir: process.env.ESTA_NEXT_DIST_DIR ?? '.next',
  allowedDevOrigins: env.ESTA_LAN_HOST === undefined ? [] : [env.ESTA_LAN_HOST],
  // The tab bar and the sidebar footer fill the bottom corners, where the indicator would cover a control.
  devIndicators: false,
  // satori loads its yoga and harfbuzz wasm at run time; bundled, `next build` cannot find them (spike S7).
  serverExternalPackages: ['satori', '@resvg/resvg-js'],
  // The receipt fonts are read from process.cwd() at run time, which the tracer cannot see.
  outputFileTracingIncludes: { '/api/invoices/*/receipt': ['./src/server/receipts/fonts/**'], '/q/*': ['./src/server/receipts/fonts/**'], '/api/export/*': ['./src/server/receipts/fonts/**'] },
};

export default createNextIntlPlugin({
  requestConfig: './src/i18n/request.ts',
  experimental: { messages: { path: './messages', format: 'json', locales: ['vi', 'en'], precompile: true } },
})(nextConfig);
