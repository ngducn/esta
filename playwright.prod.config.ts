import { defineConfig } from '@playwright/test';

const port = 3917;

export default defineConfig({
  testDir: 'e2e/prod',
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: `http://localhost:${port}` },
  webServer: {
    command: `ESTA_ENV=development pnpm build && ESTA_ENV=production PORT=${port} pnpm start`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 300_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'e2e-anon-key',
      CRON_SECRET: 'e2e-cron-secret',
    },
  },
});
