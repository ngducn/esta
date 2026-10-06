import type { NextConfig } from 'next';
import { parseEnv } from './src/server/env-schema';

parseEnv(process.env);

const nextConfig: NextConfig = {};

export default nextConfig;
