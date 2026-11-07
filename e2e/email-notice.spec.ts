import { expect, test } from '@playwright/test';
import { startAgentWorker, stopAndForget, type AgentWorker } from './helpers/agent-worker';
import { clearMail, listMail } from './helpers/inbucket';
import { laneHousehold } from './helpers/seed';
import { setClock, globalClock } from './helpers/test-clock';
import { open, PHONE, serviceGet } from './helpers/wizard';

test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

const LANE = 2;
const ME = `me.lane${LANE}@demo.esta.test`;
const TODAY = '2026-10-07';
const BRIEF_SUBJECT = 'Trợ lý: Ghi chú buổi sáng 07/10/2026';
const ACTION_SUBJECT = 'Trợ lý có ghi chú mới cần xem';

let worker: AgentWorker | undefined;

test.afterAll(async ({ request }) => {
  await stopAndForget(worker);
  await setClock(request, globalClock, null);
});

const subjects = async () => (await listMail(ME)).map((mail) => mail.Subject);
const count = (all: string[], subject: string) => all.filter((value) => value === subject).length;

test('after the 07:00 run Mẹ has one brief notice and one notice per action note, with no note text in them', async ({ page, request }) => {
  await clearMail(ME);
  await setClock(request, globalClock, `${TODAY}T07:00:00+07:00`);
  worker = await startAgentWorker({ schedule: true, notify: true });
  await expect
    .poll(async () => (await serviceGet<unknown[]>(page, `agent_jobs?kind=in.(morning_brief,portfolio_watch)&status=eq.done&household_id=eq.${laneHousehold(LANE)}&select=id`)).length, { timeout: 90_000 })
    .toBe(2);
  await expect.poll(async () => count(await subjects(), BRIEF_SUBJECT), { timeout: 60_000 }).toBe(1);
  await expect.poll(async () => count(await subjects(), ACTION_SUBJECT), { timeout: 60_000 }).toBe(3);

  const mails = await listMail(ME);
  const notice = mails.find((mail) => mail.Subject === BRIEF_SUBJECT);
  expect(notice?.Text).toMatch(/\/assistant\?note=[0-9a-f-]{36}/);
  expect(notice?.Text).not.toContain('Cần làm');
  for (const mail of mails.filter((candidate) => candidate.Subject === ACTION_SUBJECT)) expect(mail.Subject).not.toMatch(/Phòng|Thủ Đức|\d{3}/);
});

test('restarting the worker sends no second copy', async () => {
  await worker?.stop();
  worker = await startAgentWorker({ schedule: true, notify: true });
  await new Promise((resolve) => setTimeout(resolve, 5_000));
  const all = await subjects();
  expect(count(all, BRIEF_SUBJECT)).toBe(1);
  expect(count(all, ACTION_SUBJECT)).toBe(3);
});

test('a signed-out tap on the link signs in and opens the thread at that note', async ({ page, request }) => {
  await setClock(request, globalClock, `${TODAY}T07:05:00+07:00`);
  const notice = (await listMail(ME)).find((mail) => mail.Subject === BRIEF_SUBJECT);
  const link = /http\S+\/assistant\?note=[0-9a-f-]{36}/.exec(notice?.Text ?? '')?.[0];
  expect(link).toBeDefined();
  const visit = new URL(link ?? '');

  await page.setViewportSize(PHONE);
  await page.goto(`${visit.pathname}${visit.search}`);
  await expect(page).toHaveURL(/\/sign-in$/);
  await open(page, ME, 'light', PHONE);
  await expect(page).toHaveURL(new RegExp(`${visit.pathname}\\?note=`));
  await expect(page.locator('[data-testid="inbox-item"][data-kind="brief"]')).toBeInViewport();
});
