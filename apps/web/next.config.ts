import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { parseEnv } from './src/server/env-schema';

const env = parseEnv(process.env);

const nextConfig: NextConfig = {
  distDir: process.env.ESTA_NEXT_DIST_DIR ?? '.next',
  allowedDevOrigins: env.ESTA_LAN_HOST === undefined ? [] : [env.ESTA_LAN_HOST],
};

export default createNextIntlPlugin({
  requestConfig: './src/i18n/request.ts',
  experimental: { messages: { path: './messages', format: 'json', locales: ['vi', 'en'], precompile: true } },
})(nextConfig);
