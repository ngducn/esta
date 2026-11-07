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

// The seed holds one fixed day's state, so the app under test must not read the wall clock: on 2026-11-02 the
// Thủ Đức lease (to 2026-11-01) stopped counting as active and the rent sort failed. 2026-11-01 is the last day the
// whole suite passed on the real clock. slotEnv passes this to the server and the agent worker; a test_clock row still wins.
process.env.ESTA_FROZEN_NOW ||= '2026-11-01T10:00:00+07:00';

// A seeded household's files weigh about 1.8 MB, so a 1 MB part makes every export in the suite a split one.
process.env.ESTA_EXPORT_PART_MB ||= '1';

// Specs that freeze only the lane households' test clock rows at SPEC §9.3's day (e2e/helpers/test-clock.ts), so they
// never touch the global row or the worker the `clock` specs use, so they could run in parallel, but a CI shard's stack is paid for per job (about 190 s of setup each), so they share the serial clock project and its shards instead of getting jobs of their own. On
// 2026-11-06 a parallel run of the first 17 failed 13 tests on lane data, not the date (each of the 8 specs below
// reads a bill, an overdue count, a document or a lane's totals that a neighbour pays, uploads or amends), so those 8 stay serial.
const dated = [
  'leases.spec.ts',
  'lease-detail.spec.ts',
  'deposits.spec.ts',
  'invoices.spec.ts',
  'receipts.spec.ts',
  'reminder.spec.ts',
  'valuations.spec.ts',
  'statement-mapping.spec.ts',
  'tax-card.spec.ts',
];

// Specs that need the global test clock row, the agent worker or a cron route, each of which serves every household
// at once, or that move the date off SPEC §9.3's day on lanes the dated specs also use. They run one at a time.
const sharedClock = [
  // Moves the global date across midnight to prove the web server follows it without a restart.
  'clock.spec.ts',
  // Move the date on lanes the dated specs also sign in to.
  'meters.spec.ts',
  'collections.spec.ts',
  'home.spec.ts',
  // Freeze lane households but read what dated neighbours change in the same lanes (paid bills, uploaded documents).
  'documents-upload.spec.ts',
  'documents-vault.spec.ts',
  'property-detail.spec.ts',
  'record-payment.spec.ts',
  'statement-import.spec.ts',
  'fnd8.spec.ts',
  'reports.spec.ts',
  'expenses.spec.ts',
  // Start an agent worker, which polls the jobs and heartbeat of every household.
  'assistant-status.spec.ts',
  'assistant-diagnostics.spec.ts',
  'assistant-weekly.spec.ts',
  'assistant-watch.spec.ts',
  'assistant-topics.spec.ts',
  'fnd9-integration.spec.ts',
  'documents-extract.spec.ts',
  'extraction-review.spec.ts',
  'documents-multipage.spec.ts',
  'property-wizard.spec.ts',
  'northstar.spec.ts',
  'lease-from-contract.spec.ts',
  'assistant-thread.spec.ts',
  'assistant-calc.spec.ts',
  'assistant-pinned.spec.ts',
  'morning-brief.spec.ts',
  'email-notice.spec.ts',
  'assistant-market.spec.ts',
  'tasks.spec.ts',
  'assistant-proposals.spec.ts',
  'proposal-confirm.spec.ts',
  'assistant-limits.spec.ts',
  'agent-crash.spec.ts',
];

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.ts',
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
    { name: 'mobile', testIgnore: ['prod/**', ...dated, ...sharedClock], use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } },
    { name: 'desktop', testIgnore: ['prod/**', ...dated, ...sharedClock], use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    // The slot has one global test clock and one worker, so the specs that move them run one at a time.
    { name: 'clock', testMatch: [...dated, ...sharedClock], workers: 1, use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } },
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
