import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { parseEnv } from './src/server/env-schema';

parseEnv(process.env);

const nextConfig: NextConfig = {};

export default createNextIntlPlugin('./src/i18n/request.ts')(nextConfig);
