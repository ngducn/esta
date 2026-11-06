import { expect, test } from '@playwright/test';
import { openNewHousehold, PHONE, serviceInsert } from './helpers/wizard';

test.beforeEach(() => {
  test.skip(test.info().project.name !== 'mobile', 'one viewport; the rows are global to the slot, so the rule is the only one that writes them');
});

/** The status reads each job's newest run and rows cannot be deleted, so the rule's rows sit far enough ahead to beat any the slot already holds (the cron integration test stamps 2026-12-31). */
const TEN_YEARS_MS = 10 * 365 * 86_400_000;
const JOBS = ['invoices', 'lease_status', 'document_sweep', 'keep_alive'];
const run = (job: string, ok: boolean, at: Date) => ({
  job,
  started_at: at.toISOString(),
  finished_at: at.toISOString(),
  ok,
  failure: ok ? null : 'threw Error',
});

test('the operator sees a failed nightly job beside the worker line, and nothing once the next run is ok', async ({ page }) => {
  await openNewHousehold(page, 'light', PHONE);
  const failedAt = new Date(Date.now() + TEN_YEARS_MS);
  await serviceInsert(page, 'cron_runs', JOBS.map((job) => run(job, job !== 'invoices', failedAt)));
  await page.goto('/settings');
  const line = page.getByTestId('cron-status');
  await expect(line).toContainText('Việc chạy mỗi đêm bị lỗi lần gần nhất: lập hóa đơn.');
  await expect(line).not.toContainText('không chạy xong');
  await expect(page.getByTestId('worker-status')).toBeVisible();
  await page.getByTestId('settings-assistant').screenshot({ path: test.info().outputPath('cron-status-390.png') });

  await serviceInsert(page, 'cron_runs', JOBS.map((job) => run(job, true, new Date(failedAt.getTime() + 1_000))));
  await page.goto('/settings');
  await expect(page.getByTestId('worker-status')).toBeVisible();
  await expect(page.getByTestId('cron-status')).toHaveCount(0);
});
