import { expect, test, type Page } from '@playwright/test';
import { formatVnd } from '../packages/core/src/format/index.ts';
import { vnd } from '../packages/core/src/money/vnd.ts';
import { startAgentWorker, stopAndForget, type AgentWorker } from './helpers/agent-worker';
import { inEnglishAt130, memberCall, memberRest } from './helpers/auth-api';
import { boardRow } from './helpers/board';
import { seedId } from '../supabase/seed/generator/ids.ts';
import { laneHousehold, laneProperty } from './helpers/seed';
import { setClock } from './helpers/test-clock';
import { clippedText } from './helpers/text-scale';
import { DESKTOP, noSidewaysScroll, open, PHONE, recordForPr, serviceGet, seriousAxeViolations, settled, shot } from './helpers/wizard';

test.describe.configure({ mode: 'serial' });

const pause = recordForPr();
const Q1 = 'Tháng này thu được bao nhiêu từ Dĩ An?';
const MARKET = 'Giá thị trường của Đất Bảo Lộc hiện nay là bao nhiêu?';
const LEASES_ENDING = 'Hợp đồng nào hết hạn trong 60 ngày tới?';
const LATE_TENANT = 'Which tenant paid late most often this year?';
const SEPTEMBER = 'Còn tháng 9 thì sao?';
const OVERDUE_EN = 'Which rooms in Dĩ An are overdue?';

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

async function askAndTimeFirstSentence(page: Page, question: string): Promise<number> {
  await page.goto('/assistant');
  await page.getByRole('navigation', { name: 'Các mục của Trợ lý' }).getByRole('link', { name: 'Hỏi' }).click();
  await expect(page).toHaveURL(/\/assistant\/ask$/);
  await pause(page);
  await page.getByRole('textbox', { name: 'Câu hỏi của bạn' }).fill(question);
  await pause(page);
  const sent = Date.now();
  await page.getByTestId('ask-send').click();
  await expect(page).toHaveURL(/\/assistant\/ask\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId('question')).toContainText(question);
  await expect(page.getByTestId('answer-line'), 'the waiting line gives way to the first sentence').toHaveCount(0, { timeout: 30_000 });
  const firstSentence = Date.now() - sent;
  await expect(answer(page)).toHaveAttribute('data-status', 'done', { timeout: 30_000 });
  await settled(page.getByTestId('follow-up').getByTestId('ask-send'));
  await pause(page);
  return firstSentence;
}

async function incomeIn(page: Page, lane: number, month: '09' | '10') {
  const last = month === '09' ? '30' : '31';
  const rows = await memberRest<{ amount_vnd: number }[]>(page, 'GET', `allocation_facts?property_id=eq.${laneProperty(lane, 'di-an')}&received_on=gte.2026-${month}-01&received_on=lte.2026-${month}-${last}&select=amount_vnd`);
  return rows.reduce((total, row) => total + row.amount_vnd, 0);
}

const octoberIncome = (page: Page, lane: number) => incomeIn(page, lane, '10');

type StoredConversation = { readonly id: string; readonly sdk_session_id: string | null };

async function storedConversation(page: Page): Promise<StoredConversation> {
  const id = new URL(page.url()).pathname.split('/').at(-1) ?? '';
  const [row] = await memberRest<StoredConversation[]>(page, 'GET', `conversations?id=eq.${id}&select=id,sdk_session_id`);
  expect(row, 'the conversation is readable to its household').toBeDefined();
  return row as StoredConversation;
}

async function askFollowUp(page: Page, question: string) {
  const box = page.getByTestId('follow-up');
  await expect(box.getByTestId('ask-send'), 'the box opens once the answer before it settles').toBeEnabled();
  await pause(page);
  await box.getByRole('textbox', { name: 'Hỏi tiếp' }).fill(question);
  await box.getByTestId('ask-send').click();
  await expect(page.getByTestId('question')).toHaveCount(2);
  await expect(page.getByTestId('question').nth(1)).toContainText(question);
  await expect(answer(page).nth(1)).toHaveAttribute('data-status', 'done', { timeout: 30_000 });
  await expect(box.getByRole('textbox', { name: 'Hỏi tiếp' })).toHaveValue('');
  await settled(box.getByTestId('ask-send'));
  await pause(page);
}

test('Mẹ asks how much Dĩ An brought in this month: the answer streams in with the ledger amount and a link to its Thu chi tab', async ({ page }) => {
  await open(page, 'me.lane2@demo.esta.test', 'light', PHONE);
  const firstSentence = await askAndTimeFirstSentence(page, Q1);
  test.info().annotations.push({ type: 'first sentence ms', description: String(firstSentence) });
  expect(firstSentence, 'the first sentence shows within 10 s of send (AGENT.md §5.6)').toBeLessThan(10_000);

  const income = await octoberIncome(page, 2);
  expect(income, 'the seed received rent at Dĩ An in October').toBeGreaterThan(0);
  await expect(answer(page)).toContainText(`Dãy trọ Dĩ An đã thu ${formatVnd(vnd(income), 'vi')} tiền thuê.`);
  await expect(answer(page).locator('[class*="animate-"]'), 'no typing animation').toHaveCount(0);
  expect(await seriousAxeViolations(page)).toEqual([]);
  expect(await noSidewaysScroll(page), 'no sideways scroll').toBe(true);
  await shot(page, 'p5-07-q1-390x844-light');

  await pause(page);
  await answer(page).getByRole('link', { name: 'sổ thu chi của Dãy trọ Dĩ An' }).click();
  await expect(page).toHaveURL(new RegExp(`/properties/${laneProperty(2, 'di-an')}/finance`));
  await pause(page);
});

test('on her phone in dark, Mẹ asks for a market price the app does not hold, and the answer says so without a number', async ({ page }) => {
  await open(page, 'me.lane9@demo.esta.test', 'dark', PHONE);
  await askAndTimeFirstSentence(page, MARKET);
  await expect(answer(page)).toContainText('Ứng dụng chưa có giá thị trường hiện nay của Đất Bảo Lộc, nên Trợ lý không ước tính con số nào.');
  await expect(answer(page), 'no amount or digit').not.toContainText(/\d/);
  await expect(answer(page).getByRole('link'), 'no record was cited, so nothing links').toHaveCount(0);
  expect(await seriousAxeViolations(page)).toEqual([]);
  await shot(page, 'p5-07-missing-data-390x844-dark');
});

test('Mẹ asks which leases end in the next sixty days, and the answer is a table whose row opens the lease', async ({ page }) => {
  await open(page, 'me.lane2@demo.esta.test', 'light', PHONE);
  await askAndTimeFirstSentence(page, LEASES_ENDING);
  const table = answer(page).getByRole('table');
  await expect(table.getByRole('columnheader')).toHaveText(['Tài sản', 'Người thuê', 'Ngày hết hạn', 'Còn lại']);
  await expect(table.getByRole('row'), 'a header and the one lease ending').toHaveCount(2);
  await expect(table.getByRole('cell').nth(3)).toHaveText(/^\d+\u00a0ngày$/);
  expect(await seriousAxeViolations(page)).toEqual([]);
  expect(await noSidewaysScroll(page), 'no sideways scroll').toBe(true);
  await shot(page, 'p5-07-q3-table-390x844-light');

  await pause(page);
  await table.getByRole('link').click();
  await expect(page).toHaveURL(/\/properties\/[0-9a-f-]{36}\/rental\/leases\/[0-9a-f-]{36}$/);
});

test('Ryan asks in English who paid late most often this year, and the answer comes back in English', async ({ page }) => {
  await open(page, 'ryan.lane2@demo.esta.test', 'dark', PHONE);
  await askAndTimeFirstSentence(page, LATE_TENANT);
  await expect(answer(page)).toContainText(/^.+ paid late most often this year: \d+ of \d+ bills were paid in full after their due date, on average \d+ days late\./);
  await expect(answer(page).getByRole('link', { name: /Demo$/ })).toHaveAttribute('href', /^\/open\/party\/[0-9a-f-]{36}$/);
  expect(await seriousAxeViolations(page)).toEqual([]);
  await shot(page, 'p5-07-q10-english-390x844-dark');
});

test('lane 7: Mẹ asks question 1, then Còn tháng 9 thì sao?, and the follow-up gives September’s income from the session it resumed', async ({ page }) => {
  await open(page, 'me.lane7@demo.esta.test', 'dark', PHONE);
  await askAndTimeFirstSentence(page, Q1);
  const first = await storedConversation(page);
  expect(first.sdk_session_id, 'the first answer leaves a session to resume').toMatch(/^replay-[0-9a-f]{16}$/);

  await askFollowUp(page, SEPTEMBER);
  await expect(page.getByTestId('question').nth(1)).toContainText(/^Bạn hỏi lúc \d{2}:\d{2}, \d{2}\/\d{2}\/\d{4}/);
  const september = await incomeIn(page, 7, '09');
  expect(september, 'the seed received rent at Dĩ An in September').toBeGreaterThan(0);
  await expect(answer(page).nth(1)).toContainText(`Tháng 9/2026, Dãy trọ Dĩ An đã thu ${formatVnd(vnd(september), 'vi')} tiền thuê.`);
  const after = await storedConversation(page);
  expect(after.id).toBe(first.id);
  expect(after.sdk_session_id, 'the follow-up stored its own session').toMatch(/^replay-[0-9a-f]{16}$/);
  expect(after.sdk_session_id).not.toBe(first.sdk_session_id);
  expect(await seriousAxeViolations(page)).toEqual([]);
  expect(await noSidewaysScroll(page), 'no sideways scroll').toBe(true);
  await shot(page, 'p5-07-follow-up');
  await pause(page);

  await answer(page).nth(1).getByRole('link', { name: 'sổ thu chi của Dãy trọ Dĩ An' }).click();
  await expect(page).toHaveURL(new RegExp(`/properties/${laneProperty(7, 'di-an')}/finance`));
  await pause(page);
  await page.goto('/assistant/ask');
  await expect(page.getByTestId('conversation-link').first(), 'the conversation she asked last lists first').toContainText(Q1);
  await expect(page.getByTestId('ask-deep'), 'only an operator sees Suy nghĩ kỹ hơn').toHaveCount(0);
});

test('lane 8: Ryan ticks Suy nghĩ kỹ hơn and the answer runs on the deep model, which Mẹ can neither see nor ask for', async ({ page, browser }) => {
  await open(page, 'ryan.lane8@demo.esta.test', 'dark', DESKTOP);
  await page.goto('/assistant/ask');
  await page.getByRole('checkbox', { name: 'Suy nghĩ kỹ hơn' }).click();
  await page.getByRole('textbox', { name: 'Câu hỏi của bạn' }).fill(Q1);
  await page.getByTestId('ask-send').click();
  await expect(page).toHaveURL(/\/assistant\/ask\/[0-9a-f-]{36}$/);
  await expect(answer(page)).toHaveAttribute('data-status', 'done', { timeout: 30_000 });
  await expect(answer(page)).toContainText(`Dãy trọ Dĩ An đã thu ${formatVnd(vnd(await octoberIncome(page, 8)), 'vi')} tiền thuê.`);
  const { id } = await storedConversation(page);
  const [job] = await serviceGet<{ id: string; payload: { deep: boolean } }[]>(page, `agent_jobs?kind=eq.ask&payload->>conversation_id=eq.${id}&select=id,payload`);
  expect(job?.payload.deep).toBe(true);
  const runs = await serviceGet<{ model: string }[]>(page, `agent_runs?job_id=eq.${job?.id ?? ''}&select=model`);
  expect(runs.map((run) => run.model), 'the deep recording replayed').toEqual(['hand-written-deep']);
  await settled(page.getByTestId('follow-up').getByTestId('ask-send'));
  await expect(page.getByTestId('ask-busy'), 'the follow-up box opens once the answer is done').toHaveCount(0);
  await shot(page, 'p5-07-deep-1440x900-dark');

  const mother = await browser.newPage();
  await open(mother, 'me.lane8@demo.esta.test', 'light', PHONE);
  await mother.goto('/assistant/ask');
  await expect(mother.getByTestId('ask-question')).toBeVisible();
  await expect(mother.getByTestId('ask-deep')).toHaveCount(0);
  const refused = await memberCall(mother, 'POST', 'rpc/ask_question', {
    p_household_id: laneHousehold(8),
    p_conversation_id: crypto.randomUUID(),
    p_question_id: crypto.randomUUID(),
    p_question: Q1,
    p_deep: true,
    p_as_of: '2026-10-07T00:00:00Z',
  });
  expect(refused.status(), 'the database refuses a deep ask from a member who is not the operator').toBe(403);
  expect(await refused.json()).toMatchObject({ code: '42501', message: 'ESTA_FORBIDDEN' });
  await mother.close();
});

test('lane 10: Mẹ reads in English at 130% in dark, asks which rooms in Dĩ An are overdue, opens the bill and copies the reminder, with no text cut', async ({ page }) => {
  await open(page, 'me.lane10@demo.esta.test', 'dark', PHONE);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await inEnglishAt130(page, seedId('seed:member:me-lane-10'), async () => {
    await page.goto('/assistant/ask');
    await page.getByRole('textbox', { name: 'Your question' }).fill(OVERDUE_EN);
    await page.getByTestId('ask-send').click();
    await expect(answer(page)).toHaveAttribute('data-status', 'done', { timeout: 30_000 });
    await settled(page.getByTestId('follow-up').getByTestId('ask-send'));
    await expect(answer(page)).toContainText(/^In Dãy trọ Dĩ An, only Phòng 5 is overdue: 12 days late, with .+ still owed\./);
    await expect(page.getByTestId('question')).toContainText(/^You asked at \d{2}:\d{2}, \d{2}\/\d{2}\/\d{4}/);
    expect(await clippedText(page)).toEqual([]);
    expect(await noSidewaysScroll(page), 'no sideways scroll').toBe(true);
    expect(await seriousAxeViolations(page)).toEqual([]);
    await shot(page, 'p5-07-seed10-english');

    await answer(page).getByRole('link', { name: 'the bill for Phòng 5' }).click();
    await expect(page).toHaveURL(/\/collections\/invoices\/[0-9a-f-]{36}$/);
    await page.goto('/collections');
    const overdue = boardRow(page, 'overdue', 'Phòng 5, Dãy trọ Dĩ An');
    await overdue.getByTestId('row-action-remind').click();
    const sheet = page.getByTestId('reminder-sheet');
    await sheet.getByTestId('reminder-copy').click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    for (const fact of ['Phòng 5', 'quá hạn 12 ngày']) expect(copied).toContain(fact);
  });
});

test('offline, a send says it did not go; back online, the same send asks once', async ({ page }) => {
  await open(page, 'me.lane3@demo.esta.test', 'light', PHONE);
  await page.goto('/assistant/ask');
  await page.getByRole('textbox', { name: 'Câu hỏi của bạn' }).fill(MARKET);
  await page.context().setOffline(true);
  await page.getByTestId('ask-send').click();
  await expect(page.getByTestId('ask').getByRole('alert')).toHaveText('Chưa gửi được câu hỏi. Kiểm tra kết nối rồi thử lại.');
  await page.context().setOffline(false);
  await page.getByTestId('ask-send').click();
  await expect(page).toHaveURL(/\/assistant\/ask\/[0-9a-f-]{36}$/);
  await expect(answer(page)).toHaveAttribute('data-status', 'done', { timeout: 30_000 });
  const asked = await memberRest<unknown[]>(page, 'GET', `messages?role=eq.user&content_md=eq.${encodeURIComponent(MARKET)}&select=id`);
  expect(asked, 'the question is stored once').toHaveLength(1);
});

test('Ryan reads the Dĩ An answer at desktop width, and another household’s member sees only a not-found screen at its link', async ({ page, browser }) => {
  await open(page, 'ryan.lane2@demo.esta.test', 'dark', DESKTOP);
  await askAndTimeFirstSentence(page, Q1);
  await shot(page, 'p5-07-q1-1440x900-dark');
  const conversation = page.url();

  const other = await (await browser.newContext()).newPage();
  await open(other, 'me.lane9@demo.esta.test', 'light', PHONE);
  const response = await other.goto(conversation);
  expect(response?.status(), 'RLS hides the conversation outside its household').toBe(404);
  await expect(other.getByTestId('conversation-not-found')).toContainText('Không tìm thấy cuộc hỏi đáp này');
  await expect(other.getByTestId('conversation')).toHaveCount(0);
  const html = (await response?.text()) ?? '';
  expect(html, 'none of the question or the answer reaches the page').not.toContain(Q1);
  expect(html).not.toContain('tiền thuê');
  expect(await seriousAxeViolations(other)).toEqual([]);
  await shot(other, 'p5-07-not-found-390x844-light');
  const missing = await other.goto('/assistant/ask/00000000-0000-4000-8000-000000000000');
  expect(missing?.status(), 'a missing conversation reads the same').toBe(404);
  await expect(other.getByTestId('conversation-not-found')).toBeVisible();
  await other.context().close();
});
