import { defineConfig } from '@playwright/test';
import { parseSlot, slotPorts } from './scripts/slot.ts';

const ports = slotPorts(parseSlot(process.env.ESTA_SLOT));

export default defineConfig({
  testDir: 'e2e/prod',
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: `http://localhost:${ports.webProd}` },
  webServer: {
    command: `ESTA_ENV=development pnpm build && ESTA_ENV=production PORT=${ports.webProd} pnpm start`,
    url: `http://localhost:${ports.webProd}`,
    reuseExistingServer: false,
    timeout: 300_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${ports.api}`,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'e2e-anon-key',
      CRON_SECRET: 'e2e-cron-secret',
    },
  },
});
