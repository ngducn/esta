import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
      CRON_SECRET: 'test-cron-secret',
    },
  },
});
