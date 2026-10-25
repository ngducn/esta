import { defineConfig, devices } from '@playwright/test';
import { parseSlot, slotPorts } from './scripts/slot.ts';

const slot = parseSlot(process.env.ESTA_SLOT);
const port = Number(process.env.PORT ?? slotPorts(slot).web);
const baseURL = `http://localhost:${port}`;

// CI serves a production build, which compiles every page before the first test and keeps first visits fast.
// `ESTA_E2E_SERVER=dev` serves `pnpm dev` instead, which starts quicker when a developer reruns one spec.
const servers = ['build', 'dev'] as const;
const server = process.env.ESTA_E2E_SERVER ?? (process.env.CI ? 'build' : 'dev');
if (!servers.some((name) => name === server)) throw new Error(`ESTA_E2E_SERVER must be one of ${servers.join(', ')}, got "${server}"`);
const sharedClock = [
  'clock.spec.ts',
  'assistant-status.spec.ts',
  'assistant-watch.spec.ts',
  'fnd9-integration.spec.ts',
  'fnd8.spec.ts',
  'property-detail.spec.ts',
  'documents-upload.spec.ts',
  'leases.spec.ts',
  'lease-detail.spec.ts',
  'deposits.spec.ts',
  'collections.spec.ts',
  'documents-extract.spec.ts',
  'record-payment.spec.ts',
  'invoices.spec.ts',
  'receipts.spec.ts',
  'reminder.spec.ts',
  'extraction-review.spec.ts',
  'documents-vault.spec.ts',
  'documents-multipage.spec.ts',
  'property-wizard.spec.ts',
  'northstar.spec.ts',
  'valuations.spec.ts',
  'expenses.spec.ts',
  'meters.spec.ts',
  'statement-import.spec.ts',
  'statement-mapping.spec.ts',
  'home.spec.ts',
  'lease-from-contract.spec.ts',
  'tax-card.spec.ts',
  'reports.spec.ts',
  'assistant-inbox.spec.ts',
  'morning-brief.spec.ts',
  'assistant-market.spec.ts',
  'assistant-ask.spec.ts',
  'tasks.spec.ts',
  'assistant-proposals.spec.ts',
  'proposal-confirm.spec.ts',
  'assistant-limits.spec.ts',
];

export default defineConfig({
  testDir: 'e2e',
  testIgnore: 'prod/**',
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? 'github' : 'list',
  // Only `next dev` compiles a page on its first visit, so only it needs the routes warmed before the tests.
  ...(server === 'dev' ? { globalSetup: './e2e/warm-routes.ts' } : {}),
  use: {
    baseURL,
    trace: 'retain-on-failure',
    // Linux Chromium hints glyph outlines, which rounds each digit's advance differently (a 7 px gap between two
    // tabular amounts) and widens text at 130%. macOS does not hint, so turn it off to measure the same layout.
    launchOptions: { args: process.platform === 'linux' ? ['--font-render-hinting=none'] : [] },
  },
  projects: [
    { name: 'mobile', testIgnore: ['prod/**', ...sharedClock], use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } },
    { name: 'desktop', testIgnore: ['prod/**', ...sharedClock], use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    // The slot has one test clock and one worker, so the specs that move them run one at a time.
    { name: 'clock', testMatch: sharedClock, workers: 1, use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } },
  ],
  webServer:
    server === 'dev'
      ? { command: 'pnpm dev', url: baseURL, reuseExistingServer: !process.env.CI, timeout: 120_000 }
      : {
          // ESTA_ENV=test keeps /dev/* and /api/test/* on, which the clock specs need; ESTA_ENV=production hides them.
          command: 'node scripts/web.ts build && node scripts/web.ts start',
          env: { ESTA_ENV: 'test', ESTA_NEXT_DIST_DIR: `.next/e2e-slot-${slot}` },
          url: baseURL,
          reuseExistingServer: false,
          timeout: 600_000,
        },
});
