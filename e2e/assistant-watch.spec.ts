import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';
import { startAgentWorker, type AgentWorker } from './helpers/agent-worker';
import { setClock } from './helpers/test-clock';
import { DESKTOP, open, PHONE, serviceGet, seriousAxeViolations, vnd } from './helpers/wizard';

// The scheduler queues the watch for every household on the slot's one clock, so the spec runs in the `clock` project.
test.describe.configure({ mode: 'serial' });

const GUARD_CASE = join(import.meta.dirname, '..', 'fixtures', 'agent-replay-cases', 'guard-violation');
const TODAY = '2026-10-07';
const GUARD_TITLE = 'Trợ lý đã giữ lại một ghi chú có số tự gõ';

let worker: AgentWorker | undefined;

test.afterAll(async ({ request }) => {
  await worker?.stop();
  await setClock(request, null);
});

const watchNotes = (page: Page) => page.getByTestId('inbox-item').filter({ has: page.getByTestId('note-dedupe').getByText(new RegExp(`^watch(_digest)?:.*${TODAY}$`)) });
const note = (page: Page, title: string) => page.getByTestId('inbox-item').filter({ has: page.getByRole('heading', { name: title, exact: true }) });

test('at 06:45 the morning watch has run for every household, and Ryan sees its four notes with every link resolving', async ({ page, request }) => {
  await setClock(request, `${TODAY}T06:45:00+07:00`);
  worker = await startAgentWorker({ schedule: true });
  const households = await serviceGet<unknown[]>(page, 'households?select=id');
  await expect
    .poll(async () => (await serviceGet<unknown[]>(page, `agent_jobs?kind=eq.portfolio_watch&status=eq.done&idempotency_key=like.*:${TODAY}&select=id`)).length, { timeout: 60_000 })
    .toBe(households.length);

  await open(page, 'ryan.lane6@demo.esta.test', 'light', PHONE);
  await page.goto('/assistant');
  await expect(page.getByTestId('watch-status')).toHaveAttribute('data-status', 'done');
  await expect(page.getByTestId('watch-notes')).toHaveText('4 ghi chú mới');
  await expect(watchNotes(page)).toHaveCount(4);
  const overdue = note(page, 'Phòng 5 Dãy trọ Dĩ An quá hạn 12 ngày');
  await expect(overdue).toContainText(vnd('2.800.000'));
  await expect(overdue.getByTestId('note-diagnostics')).toContainText('alert · action · all');
  await expect(note(page, 'Hợp đồng Căn hộ Thủ Đức sắp hết hạn')).toBeVisible();
  const digest = page.getByTestId('inbox-item').filter({ has: page.getByTestId('note-dedupe').getByText(`watch_digest:${TODAY}`, { exact: true }) });
  await expect(digest).toContainText('Kho Biên Hòa để trống 70 ngày');
  await expect(digest).toContainText('Phòng 8 Dãy trọ Dĩ An để trống 67 ngày');
  await expect(digest.getByTestId('note-link')).toHaveCount(5);
  await expect(watchNotes(page).locator('[data-testid="note-link"][data-ok="false"]')).toHaveCount(0);
  expect(await seriousAxeViolations(page)).toEqual([]);

  await page.getByRole('button', { name: 'Chạy theo dõi' }).click();
  await expect(page.getByTestId('watch-notes'), 'a second run the same day adds nothing').toHaveText('Không có ghi chú mới', { timeout: 30_000 });
  await expect(watchNotes(page)).toHaveCount(4);
});

test('a note that still types numbers after its repair turn fails the run and reaches Ryan alone', async ({ page }) => {
  await worker?.stop();
  worker = await startAgentWorker({ replayDir: GUARD_CASE });

  await open(page, 'ryan.lane3@demo.esta.test', 'dark', DESKTOP);
  await page.goto('/assistant');
  await page.getByRole('button', { name: 'Chạy theo dõi' }).click();
  await expect(page.getByTestId('watch-status')).toHaveAttribute('data-status', 'failed', { timeout: 30_000 });
  await expect(page.getByTestId('watch-error')).toContainText('number_guard');
  const held = note(page, GUARD_TITLE);
  await expect(held).toHaveCount(1);
  await expect(held.getByTestId('note-operator')).toBeVisible();
  await expect(held).toContainText('quá hạn mười hai ngày');
  expect(await seriousAxeViolations(page)).toEqual([]);

  await page.context().clearCookies();
  await open(page, 'me.lane3@demo.esta.test', 'dark', PHONE);
  await page.goto('/assistant');
  await expect(page.getByTestId('inbox-item').first()).toBeVisible();
  await expect(note(page, GUARD_TITLE), 'Mẹ never sees an operator note').toHaveCount(0);
});
