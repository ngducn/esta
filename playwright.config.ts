import { defineConfig, devices } from '@playwright/test';
import { parseSlot, slotPorts } from './scripts/slot.ts';

const port = Number(process.env.PORT ?? slotPorts(parseSlot(process.env.ESTA_SLOT)).web);
const baseURL = `http://localhost:${port}`;
const sharedClock = ['clock.spec.ts', 'assistant-status.spec.ts', 'fnd9-integration.spec.ts'];

export default defineConfig({
  testDir: 'e2e',
  testIgnore: 'prod/**',
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [
    { name: 'mobile', testIgnore: ['prod/**', ...sharedClock], use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } },
    { name: 'desktop', testIgnore: ['prod/**', ...sharedClock], use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    // The slot has one test clock and one worker, so the specs that move them run one at a time.
    { name: 'clock', testMatch: sharedClock, workers: 1, use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: 'pnpm dev',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
