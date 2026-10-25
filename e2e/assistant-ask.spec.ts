import { expect, test, type Page } from '@playwright/test';
import { formatVnd } from '../packages/core/src/format/index.ts';
import { startAgentWorker, stopAndForget, type AgentWorker } from './helpers/agent-worker';
import { memberRest } from './helpers/auth-api';
import { laneProperty } from './helpers/seed';
import { setClock } from './helpers/test-clock';
import { DESKTOP, noSidewaysScroll, open, PHONE, recordForPr, seriousAxeViolations, shot } from './helpers/wizard';

test.describe.configure({ mode: 'serial' });

const pause = recordForPr();
const Q1 = 'Tháng này thu được bao nhiêu từ Dĩ An?';
const MARKET = 'Giá thị trường của Đất Bảo Lộc hiện nay là bao nhiêu?';

let worker: AgentWorker | undefined;

test.beforeAll(async ({ request }) => {
  await setClock(request, '2026-10-07T07:00:00+07:00');
  worker = await startAgentWorker();
});

test.afterAll(async ({ request }) => {
  await stopAndForget(worker);
  await setClock(request, null);
});

const answer = (page: Page) => page.getByTestId('answer');

/** Sends the question from Trợ lý > Hỏi and returns the milliseconds from the tap to the first visible sentence. */
async function ask(page: Page, question: string): Promise<number> {
  await page.goto('/assistant');
  await page.getByRole('navigation', { name: 'Các mục của Trợ lý' }).getByRole('link', { name: 'Hỏi' }).click();
  await expect(page).toHaveURL(/\/assistant\/ask$/);
  await page.getByRole('textbox', { name: 'Câu hỏi của bạn' }).fill(question);
  await pause(page);
  const sent = Date.now();
  await page.getByTestId('ask-send').click();
  await expect(page).toHaveURL(/\/assistant\/ask\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId('question')).toContainText(question);
  await expect(page.getByTestId('answer-line'), 'the waiting line gives way to the first sentence').toHaveCount(0, { timeout: 30_000 });
  const firstSentence = Date.now() - sent;
  await expect(answer(page)).toHaveAttribute('data-status', 'done', { timeout: 30_000 });
  return firstSentence;
}

async function octoberIncome(page: Page, lane: number) {
  const rows = await memberRest<{ amount_vnd: number }[]>(page, 'GET', `allocation_facts?property_id=eq.${laneProperty(lane, 'di-an')}&received_on=gte.2026-10-01&received_on=lte.2026-10-31&select=amount_vnd`);
  return rows.reduce((total, row) => total + row.amount_vnd, 0);
}

test('Mẹ asks how much Dĩ An brought in this month: the answer streams in with the ledger amount and a link to its Thu chi tab', async ({ page }) => {
  await open(page, 'me.lane2@demo.esta.test', 'light', PHONE);
  const firstSentence = await ask(page, Q1);
  test.info().annotations.push({ type: 'first sentence ms', description: String(firstSentence) });
  expect(firstSentence, 'the first sentence shows within 10 s of send (AGENT.md §5.6)').toBeLessThan(10_000);

  const income = await octoberIncome(page, 2);
  expect(income, 'the seed received rent at Dĩ An in October').toBeGreaterThan(0);
  await expect(answer(page)).toContainText(`Dãy trọ Dĩ An đã thu ${formatVnd(income, 'vi')} tiền thuê.`);
  await expect(answer(page).locator('[class*="animate-"]'), 'no typing animation').toHaveCount(0);
  expect(await seriousAxeViolations(page)).toEqual([]);
  await noSidewaysScroll(page);
  await shot(page, 'p5-07-q1-390x844-light');

  await pause(page);
  await answer(page).getByRole('link', { name: 'sổ thu chi của Dãy trọ Dĩ An' }).click();
  await expect(page).toHaveURL(new RegExp(`/properties/${laneProperty(2, 'di-an')}/finance`));
});

test('on her phone in dark, Mẹ asks for a market price the app does not hold, and the answer says so without a number', async ({ page }) => {
  await open(page, 'me.lane9@demo.esta.test', 'dark', PHONE);
  await ask(page, MARKET);
  await expect(answer(page)).toContainText('Ứng dụng chưa có giá thị trường hiện nay của Đất Bảo Lộc, nên Trợ lý không ước tính con số nào.');
  await expect(answer(page), 'no amount or digit').not.toContainText(/\d/);
  await expect(answer(page).getByRole('link'), 'no record was cited, so nothing links').toHaveCount(0);
  expect(await seriousAxeViolations(page)).toEqual([]);
  await shot(page, 'p5-07-missing-data-390x844-dark');
});

test('Ryan reads the Dĩ An answer at desktop width, and another household’s member sees only a not-found screen at its link', async ({ page, browser }) => {
  await open(page, 'ryan.lane2@demo.esta.test', 'dark', DESKTOP);
  await ask(page, Q1);
  await shot(page, 'p5-07-q1-1440x900-dark');
  const conversation = page.url();

  const other = await browser.newPage();
  await open(other, 'me.lane9@demo.esta.test', 'light', PHONE);
  const response = await other.goto(conversation);
  await expect(other.getByRole('heading', { name: '404' }), 'RLS hides the conversation outside its household').toBeVisible();
  await expect(other.getByTestId('conversation')).toHaveCount(0);
  const html = (await response?.text()) ?? '';
  expect(html, 'none of the question or the answer reaches the page').not.toContain(Q1);
  expect(html).not.toContain('tiền thuê');
  await other.close();
});
