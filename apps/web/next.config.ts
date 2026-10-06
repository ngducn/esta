import type { NextConfig } from 'next';

// Parsing here makes a bad variable stop `next dev`, `next build` and `next start` before anything serves.
import './src/server/env';

const nextConfig: NextConfig = {};

export default nextConfig;
