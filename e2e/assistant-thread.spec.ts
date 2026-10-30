import { expect, test, type Page } from '@playwright/test';
import { formatVnd } from '../packages/core/src/format/index.ts';
import { vnd as money } from '../packages/core/src/money/vnd.ts';
import { seedId } from '../supabase/seed/generator/ids.ts';
import { startAgentWorker, stopAndForget, type AgentWorker } from './helpers/agent-worker';
import { inEnglishAt130, memberCall, memberRest } from './helpers/auth-api';
import { boardRow } from './helpers/board';
import { initialJs, INITIAL_JS_BUDGET_BYTES } from './helpers/bundle';
import { laneHousehold, laneProperty } from './helpers/seed';
import { setClock } from './helpers/test-clock';
import { clippedText } from './helpers/text-scale';
import { freshThread, pinnedArea, pinnedRow, sendInThread } from './helpers/thread';
import { DESKTOP, noSidewaysScroll, open, PHONE, recordForPr, serviceGet, servicePatch, serviceUpsert, seriousAxeViolations, settled, shot, toast, vnd } from './helpers/wizard';

test.describe.configure({ mode: 'serial' });

const pause = recordForPr();
const Q1 = 'Tháng này thu được bao nhiêu từ Dĩ An?';
const MARKET = 'Giá thị trường của Đất Bảo Lộc hiện nay là bao nhiêu?';
const LEASES_ENDING = 'Hợp đồng nào hết hạn trong 60 ngày tới?';
const LATE_TENANT = 'Which tenant paid late most often this year?';
const SEPTEMBER = 'Còn tháng 9 thì sao?';
const AUGUST = 'Còn tháng 8 thì sao?';
const OVERDUE_EN = 'Which rooms in Dĩ An are overdue?';
const ZALO = 'Viết tin nhắn Zalo nhắc khách phòng 5 ở Dĩ An đóng tiền.';
const BY_YEAR = 'Có nên cho thuê theo năm thay vì theo tháng không?';

const NOTE_LANE = 9;
const NOTES = {
  overdue: { id: seedId(`seed:agent-item:W1-lane-${NOTE_LANE}`), title: 'Phòng 5 Dãy trọ Dĩ An quá hạn 11 ngày' },
  leaseEnding: { id: seedId(`seed:agent-item:W3-lane-${NOTE_LANE}`), title: 'Hợp đồng Căn hộ Thủ Đức hết hạn sau 26 ngày' },
  watch: { id: seedId(`seed:agent-item:watch-lane-${NOTE_LANE}`), title: 'Ba việc cần để ý' },
};
const OPERATOR_NOTE = { id: seedId(`e2e:agent-item:operator-lane-${NOTE_LANE}`), title: 'Trợ lý cần Ryan đăng nhập lại Demo' };

let worker: AgentWorker | undefined;

test.beforeAll(async ({ request }) => {
  await setClock(request, '2026-10-07T07:00:00+07:00');
  worker = await startAgentWorker();
});

test.afterAll(async ({ request }) => {
  await stopAndForget(worker);
  await setClock(request, null);
});

const answer = (page: Page) => page.getByTestId('answer').last();
const note = (page: Page, title: string) => page.getByTestId('inbox-item').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
const statusOf = async (page: Page, id: string) => (await serviceGet<{ status: string }[]>(page, `agent_items?id=eq.${id}&select=status`))[0]?.status;
/** Sends `message` as the first of a fresh thread and times the first visible sentence of its answer. */
async function sendAndTimeFirstSentence(page: Page, message: string, label?: string): Promise<number> {
  await page.goto('/assistant');
  await pause(page);
  const sent = Date.now();
  await sendInThread(page, message, label === undefined ? {} : { label });
  await expect(page.getByTestId('answer-line'), 'the waiting line gives way to the first sentence').toHaveCount(0, { timeout: 30_000 });
  const firstSentence = Date.now() - sent;
  await expect(answer(page)).toHaveAttribute('data-status', 'done', { timeout: 30_000 });
  await settled(page.getByTestId('composer-send'));
  await pause(page);
  return firstSentence;
}

async function incomeIn(page: Page, lane: number, month: '08' | '09' | '10') {
  const last = month === '09' ? '30' : '31';
  const rows = await memberRest<{ amount_vnd: number }[]>(page, 'GET', `allocation_facts?property_id=eq.${laneProperty(lane, 'di-an')}&received_on=gte.2026-${month}-01&received_on=lte.2026-${month}-${last}&select=amount_vnd`);
  return rows.reduce((total, row) => total + row.amount_vnd, 0);
}

type StoredConversation = { readonly id: string; readonly sdk_session_id: string | null };

/** The conversation that holds her latest message, as she reads it under RLS. */
async function latestConversation(page: Page): Promise<StoredConversation> {
  const [message] = await memberRest<{ conversation_id: string }[]>(page, 'GET', 'messages?role=eq.user&select=conversation_id&order=created_at.desc&limit=1');
  const [row] = await memberRest<StoredConversation[]>(page, 'GET', `conversations?id=eq.${message?.conversation_id ?? ''}&select=id,sdk_session_id`);
  expect(row, 'she reads the conversation she started').toBeDefined();
  return row as StoredConversation;
}

test('Mẹ reads Trợ lý’s notes in time order, marks one read, hides one, undoes it and finds it again as one muted line', async ({ page }) => {
  await servicePatch(page, `agent_items?id=in.(${Object.values(NOTES).map(({ id }) => id).join(',')})`, { status: 'new' });
  await open(page, `me.lane${NOTE_LANE}@demo.esta.test`, 'light', PHONE);
  await page.goto('/assistant');

  const seeded = page.getByTestId('inbox-item').filter({ has: page.getByRole('heading', { name: new RegExp(Object.values(NOTES).map(({ title }) => title).join('|')) }) });
  await expect(seeded.getByRole('heading', { level: 3 }), 'notes of one run read in id order, oldest first').toHaveText([NOTES.watch.title, NOTES.leaseEnding.title, NOTES.overdue.title]);
  await expect(page.getByTestId('thread-entry').last(), 'the reply box follows the newest entry').toBeInViewport();
  await expect(page.getByTestId('composer')).toBeInViewport();

  const overdue = note(page, NOTES.overdue.title);
  await expect(overdue).toContainText('Hoàng Văn Em Demo');
  await expect(overdue).toContainText(vnd('2.800.000'));
  await expect(overdue.locator('time')).toHaveText('06/10 06:45');
  await overdue.getByRole('button', { name: `Đã đọc: ${NOTES.overdue.title}` }).click();
  await expect(overdue).toHaveAttribute('data-status', 'read');
  expect(await statusOf(page, NOTES.overdue.id)).toBe('read');
  expect(await seriousAxeViolations(page)).toEqual([]);

  const watch = note(page, NOTES.watch.title);
  await watch.getByRole('button', { name: `Ẩn ghi chú: ${NOTES.watch.title}` }).click();
  await expect(watch).toHaveCount(0);
  await expect(toast(page)).toContainText('Đã ẩn ghi chú.');
  await toast(page).getByRole('button', { name: 'Hoàn tác' }).click();
  await expect(watch, 'Hoàn tác puts the note back as it was, unread').toHaveAttribute('data-status', 'new');

  await watch.getByTestId('note-dismiss').click();
  await expect.poll(() => statusOf(page, NOTES.watch.id)).toBe('dismissed');
  await page.reload();
  const line = page.getByTestId('note-settled').filter({ hasText: NOTES.watch.title });
  await expect(line, 'a hidden note keeps its place as one muted line').toContainText(`Đã ẩn: ${NOTES.watch.title}`);
  await expect(page.getByTestId('thread-entry').filter({ has: line })).toHaveAttribute('id', `note-${NOTES.watch.id}`);
  await expect(line, 'the streamed page has replaced its loading screen').toBeVisible();
  await shot(page, 'p5-12-hidden-line-390x844-light');
  await line.getByRole('button', { name: `Hiện lại ghi chú ${NOTES.watch.title}` }).click();
  await expect(watch).toHaveAttribute('data-status', 'read');
  await expect(line).toHaveCount(0);
});

test('an operator note reaches Ryan’s thread with its pill and never Mẹ’s', async ({ page }) => {
  await serviceUpsert(page, 'agent_items', {
    id: OPERATOR_NOTE.id,
    household_id: laneHousehold(NOTE_LANE),
    kind: 'system',
    severity: 'action',
    audience: 'operator',
    title: OPERATOR_NOTE.title,
    body_md: 'Phiên đăng nhập của Trợ lý đã hết hạn.',
    status: 'new',
    dedupe_key: `e2e:operator-note:lane-${NOTE_LANE}`,
    created_at: '2026-10-07T07:01:00+07:00',
  });
  await open(page, `me.lane${NOTE_LANE}@demo.esta.test`, 'light', PHONE);
  await page.goto('/assistant');
  await expect(note(page, NOTES.overdue.title)).toBeVisible();
  await expect(note(page, OPERATOR_NOTE.title), 'RLS keeps an operator note from a member').toHaveCount(0);
  await expect(page.getByTestId('pinned-item').first()).toBeVisible();
  await expect(pinnedRow(page, OPERATOR_NOTE.title), 'and from her Cần xử lý').toHaveCount(0);

  await page.context().clearCookies();
  await open(page, `ryan.lane${NOTE_LANE}@demo.esta.test`, 'light', PHONE);
  await page.goto('/assistant');
  const operatorNote = note(page, OPERATOR_NOTE.title);
  await expect(operatorNote.getByTestId('note-operator')).toHaveText('Chỉ người vận hành');
  await expect(operatorNote.locator('time')).toHaveText('07:01');
  await expect(page.getByTestId('pinned-item').first(), 'an urgent operator note pins for Ryan, newest first').toContainText(OPERATOR_NOTE.title);
});

test('Mẹ asks how much Dĩ An brought in this month: the answer streams under her message with the ledger amount and a link to its Thu chi tab', async ({ page }) => {
  await open(page, 'me.lane2@demo.esta.test', 'light', PHONE);
  await freshThread(page, 'me', 2);
  const firstSentence = await sendAndTimeFirstSentence(page, Q1);
  test.info().annotations.push({ type: 'first sentence ms', description: String(firstSentence) });
  expect(firstSentence, 'the first sentence shows within 10 s of send (AGENT.md §5.6)').toBeLessThan(10_000);

  const income = await incomeIn(page, 2, '10');
  expect(income, 'the seed received rent at Dĩ An in October').toBeGreaterThan(0);
  await expect(answer(page)).toContainText(`Dãy trọ Dĩ An đã thu ${formatVnd(money(income), 'vi')} tiền thuê.`);
  const asked = page.locator('[data-testid="thread-entry"][data-kind="question"]').last();
  await expect(asked.locator('xpath=following-sibling::li[1]'), 'the answer follows her message').toHaveAttribute('data-kind', 'answer');
  await expect(page.getByTestId('question').last()).toContainText(/^Bạn gửi lúc \d{2}:\d{2}/);
  await expect(page.locator('[class*="animate-"]'), 'no typing animation').toHaveCount(0);
  expect(await seriousAxeViolations(page)).toEqual([]);
  expect(await noSidewaysScroll(page), 'no sideways scroll').toBe(true);
  await shot(page, 'p5-12-q1-390x844-light');

  await pause(page);
  await answer(page).getByRole('link', { name: 'sổ thu chi của Dãy trọ Dĩ An' }).click();
  await expect(page).toHaveURL(new RegExp(`/properties/${laneProperty(2, 'di-an')}/finance`));
});

test('on her phone in dark, Mẹ asks for a market price the app does not hold, and the answer says so without a number', async ({ page }) => {
  await open(page, 'me.lane9@demo.esta.test', 'dark', PHONE);
  await freshThread(page, 'me', 9);
  await sendAndTimeFirstSentence(page, MARKET);
  await expect(answer(page)).toContainText('Ứng dụng chưa có giá thị trường hiện nay của Đất Bảo Lộc, nên Trợ lý không ước tính con số nào.');
  await expect(answer(page), 'no amount or digit').not.toContainText(/\d/);
  await expect(answer(page).getByRole('link'), 'no record was cited, so nothing links').toHaveCount(0);
  expect(await seriousAxeViolations(page)).toEqual([]);
  await shot(page, 'p5-12-missing-data-390x844-dark');
});

test('Mẹ asks which leases end in the next sixty days, and the answer is a table whose row opens the lease', async ({ page }) => {
  await open(page, 'me.lane2@demo.esta.test', 'light', PHONE);
  await freshThread(page, 'me', 2);
  await sendAndTimeFirstSentence(page, LEASES_ENDING);
  const table = answer(page).getByRole('table');
  await expect(table.getByRole('columnheader')).toHaveText(['Tài sản', 'Người thuê', 'Ngày hết hạn', 'Còn lại']);
  await expect(table.getByRole('row'), 'a header and the one lease ending').toHaveCount(2);
  expect(await seriousAxeViolations(page)).toEqual([]);
  expect(await noSidewaysScroll(page), 'no sideways scroll').toBe(true);

  await page.reload();
  await expect(table.getByRole('row'), 'reopened, the finished answer renders the same table').toHaveCount(2);
  await table.getByRole('link').click();
  await expect(page).toHaveURL(/\/properties\/[0-9a-f-]{36}\/rental\/leases\/[0-9a-f-]{36}$/);
});

test('the thread ships no next-intl client runtime and stays under the initial JS budget', async ({ page }) => {
  test.skip(!process.env.CI && process.env.ESTA_E2E_SERVER !== 'build', 'the budget is for a production build; a dev server ships unminified chunks');
  await open(page, 'me.lane2@demo.esta.test', 'light', PHONE);
  const measured = await initialJs(page.request, '/assistant');
  expect(measured.withIntlRuntime).toEqual([]);
  expect(measured.gzippedBytes).toBeLessThan(INITIAL_JS_BUDGET_BYTES);
});

test('Ryan asks in English who paid late most often this year, and the answer comes back in English', async ({ page }) => {
  await open(page, 'ryan.lane2@demo.esta.test', 'dark', PHONE);
  await freshThread(page, 'ryan', 2);
  await sendAndTimeFirstSentence(page, LATE_TENANT);
  await expect(answer(page)).toContainText(/^.+ paid late most often this year: \d+ of \d+ bills were paid in full after their due date, on average \d+ days late\./);
  await expect(answer(page).getByRole('link', { name: /Demo$/ })).toHaveAttribute('href', /^\/open\/party\/[0-9a-f-]{36}$/);
  expect(await seriousAxeViolations(page)).toEqual([]);
});

test('thread case T1: Mẹ asks for a Zalo reminder to Phòng 5, the draft names the tenant and what the board says is owed, and Sao chép copies it', async ({ page }) => {
  await open(page, 'me.lane3@demo.esta.test', 'dark', PHONE);
  await freshThread(page, 'me', 3);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await sendAndTimeFirstSentence(page, ZALO);
  const draft = `Chào Hoàng Văn Em Demo, tiền thuê Phòng 5 ở Dãy trọ Dĩ An đến hạn ngày 25/09/2026 hiện còn ${vnd('2.800.000')}.`;
  await expect(answer(page)).toContainText(draft);
  await expect(answer(page), 'the overdue days come from the bill, not the note title’s 11').not.toContainText('11 ngày');

  const copy = page.getByTestId('answer-copy').last();
  await expect(copy).toHaveText('Sao chép');
  await copy.click();
  await expect(toast(page)).toContainText('Đã sao chép câu trả lời.');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  const shown = await answer(page).innerText();
  expect(copied.replace(/\s+/g, ' ').trim(), 'the clipboard holds the text she reads').toBe(shown.replace(/\s+/g, ' ').trim());
  expect(copied).toContain(draft);
  expect(copied, 'no placeholder, link target or Markdown').not.toMatch(/\{\{|\]\(|esta:|\*\*/);

  await page.evaluate(() => {
    navigator.clipboard.writeText = () => Promise.reject(new DOMException('denied', 'NotAllowedError'));
  });
  await copy.click();
  await expect(toast(page)).toContainText('Chưa sao chép được.');
  expect(await page.evaluate(() => window.getSelection()?.toString() ?? ''), 'the answer is left selected for a long press').toContain(draft);
  await page.goto('/collections');
  await expect(boardRow(page, 'overdue', 'Phòng 5, Dãy trọ Dĩ An'), 'the draft owes what the board shows').toContainText(vnd('2.800.000'));
  await page.goto('/assistant');
  expect(await seriousAxeViolations(page)).toEqual([]);
  await shot(page, 'p5-12-zalo-draft-390x844-dark');
});

test('thread case T2: Ryan asks whether to rent by the year, and the advice holds no number', async ({ page }) => {
  await open(page, 'ryan.lane4@demo.esta.test', 'light', DESKTOP);
  await freshThread(page, 'ryan', 4);
  await sendAndTimeFirstSentence(page, BY_YEAR);
  await expect(answer(page)).toContainText('Cho thuê theo năm giúp nguồn thu ổn định hơn');
  await expect(answer(page), 'no digit').not.toContainText(/\d/);
  await expect(answer(page), 'no number word').not.toContainText(/\b(hai|ba|bốn|năm năm|mười)\b/);
  expect(await seriousAxeViolations(page)).toEqual([]);
  await shot(page, 'p5-12-advice-1440x900-light');
});

test('Mẹ asks question 1, then Còn tháng 9 thì sao?, and the follow-up joins the conversation and resumes its session', async ({ page }) => {
  await open(page, 'me.lane7@demo.esta.test', 'dark', PHONE);
  await freshThread(page, 'me', 7);
  await sendAndTimeFirstSentence(page, Q1);
  const first = await latestConversation(page);
  expect(first.sdk_session_id, 'the first answer leaves a session to resume').toMatch(/^replay-[0-9a-f]{16}$/);

  await sendAndTimeFirstSentence(page, SEPTEMBER);
  const september = await incomeIn(page, 7, '09');
  await expect(answer(page)).toContainText(`Tháng 9/2026, Dãy trọ Dĩ An đã thu ${formatVnd(money(september), 'vi')} tiền thuê.`);
  const after = await latestConversation(page);
  expect(after.id, 'the follow-up joined the same conversation').toBe(first.id);
  expect(after.sdk_session_id).not.toBe(first.sdk_session_id);
  await expect(page.getByTestId('composer-deep'), 'only an operator sees Suy nghĩ kỹ hơn').toHaveCount(0);
  expect(await seriousAxeViolations(page)).toEqual([]);
  expect(await noSidewaysScroll(page), 'no sideways scroll').toBe(true);
});

test('Ryan ticks Suy nghĩ kỹ hơn and the answer runs on the deep model, which Mẹ can neither see nor ask for', async ({ page, browser }) => {
  await open(page, 'ryan.lane8@demo.esta.test', 'dark', DESKTOP);
  await freshThread(page, 'ryan', 8);
  await page.goto('/assistant');
  await page.getByRole('checkbox', { name: 'Suy nghĩ kỹ hơn' }).click();
  await sendInThread(page, Q1);
  await expect(answer(page)).toHaveAttribute('data-status', 'done', { timeout: 30_000 });
  await expect(answer(page)).toContainText(`Dãy trọ Dĩ An đã thu ${formatVnd(money(await incomeIn(page, 8, '10')), 'vi')} tiền thuê.`);
  const { id } = await latestConversation(page);
  const [job] = await serviceGet<{ id: string; payload: { deep: boolean } }[]>(page, `agent_jobs?kind=eq.ask&payload->>conversation_id=eq.${id}&select=id,payload`);
  expect(job?.payload.deep).toBe(true);
  const runs = await serviceGet<{ model: string }[]>(page, `agent_runs?job_id=eq.${job?.id ?? ''}&select=model`);
  expect(runs.map((run) => run.model), 'the deep recording replayed').toEqual(['hand-written-deep']);
  await shot(page, 'p5-12-deep-1440x900-dark');

  const mother = await browser.newPage();
  await open(mother, 'me.lane8@demo.esta.test', 'light', PHONE);
  await mother.goto('/assistant');
  await expect(mother.getByTestId('composer-message')).toBeVisible();
  await expect(mother.getByTestId('composer-deep')).toHaveCount(0);
  const refused = await memberCall(mother, 'POST', 'rpc/ask_in_thread', { p_household_id: laneHousehold(8), p_question_id: crypto.randomUUID(), p_question: Q1, p_deep: true });
  expect(refused.status(), 'the database refuses a deep ask from a member who is not the operator').toBe(403);
  expect(await refused.json()).toMatchObject({ code: '42501', message: 'ESTA_FORBIDDEN' });
  await mother.close();
});

test('lane 10: Mẹ reads in English at 130% in dark, asks which rooms in Dĩ An are overdue, opens the bill and copies the reminder, with no text cut', async ({ page }) => {
  await open(page, 'me.lane10@demo.esta.test', 'dark', PHONE);
  await freshThread(page, 'me', 10);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await inEnglishAt130(page, seedId('seed:member:me-lane-10'), async () => {
    await sendAndTimeFirstSentence(page, OVERDUE_EN, 'Write to Trợ lý');
    await expect(answer(page)).toContainText(/^In Dãy trọ Dĩ An, only Phòng 5 is overdue: 12 days late, with .+ still owed\./);
    await expect(page.getByTestId('question').last()).toContainText(/^You sent at \d{2}:\d{2}/);
    expect(await clippedText(page)).toEqual([]);
    expect(await noSidewaysScroll(page), 'no sideways scroll').toBe(true);
    const coveredBy = async () => {
      const [composer, tabs] = [await page.getByTestId('composer').boundingBox(), await page.getByRole('navigation', { name: 'Main sections' }).last().boundingBox()];
      return (composer?.y ?? 0) + (composer?.height ?? 0) - (tabs?.y ?? 0);
    };
    await expect.poll(coveredBy, { message: 'the tab bar never covers the reply box' }).toBeLessThanOrEqual(0);
    expect(await seriousAxeViolations(page)).toEqual([]);
    await shot(page, 'p5-12-seed10-english');

    const area = await pinnedArea(page);
    expect(area.share <= 1 / 3 || !area.open, `Cần xử lý takes at most a third of the screen or folds: ${JSON.stringify(area)}`).toBe(true);

    await answer(page).getByRole('link', { name: 'the bill for Phòng 5' }).click();
    await expect(page).toHaveURL(/\/collections\/invoices\/[0-9a-f-]{36}$/);
    await page.goto('/collections');
    await boardRow(page, 'overdue', 'Phòng 5, Dãy trọ Dĩ An').getByTestId('row-action-remind').click();
    await page.getByTestId('reminder-sheet').getByTestId('reminder-copy').click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    for (const fact of ['Phòng 5', 'quá hạn 12 ngày']) expect(copied).toContain(fact);
  });
});

test('offline, a send says it did not go; back online, the same send asks once', async ({ page }) => {
  await open(page, 'me.lane5@demo.esta.test', 'light', PHONE);
  await freshThread(page, 'me', 5);
  await page.goto('/assistant');
  await page.getByRole('textbox', { name: 'Viết cho Trợ lý' }).fill(MARKET);
  await page.context().setOffline(true);
  await page.getByTestId('composer-send').click();
  await expect(page.getByTestId('composer').getByRole('alert')).toHaveText('Chưa gửi được câu hỏi. Kiểm tra kết nối rồi thử lại.');
  await page.context().setOffline(false);
  await page.getByTestId('composer-send').click();
  await expect(page.getByTestId('question').last()).toContainText(MARKET);
  await expect(answer(page)).toHaveAttribute('data-status', 'done', { timeout: 30_000 });
  const asked = await memberRest<unknown[]>(page, 'GET', `messages?role=eq.user&content_md=eq.${encodeURIComponent(MARKET)}&select=id`);
  expect(asked, 'the message is stored once').toHaveLength(1);
});

test('old Hỏi links land on the thread, and another household’s conversation link shows only the not-found page', async ({ page, browser }) => {
  await open(page, 'ryan.lane2@demo.esta.test', 'dark', DESKTOP);
  await freshThread(page, 'ryan', 2);
  await sendAndTimeFirstSentence(page, Q1);
  await shot(page, 'p5-12-q1-1440x900-dark');
  const { id } = await latestConversation(page);
  const redirected = async (path: string) => (await page.goto(path))?.request().redirectedFrom()?.url() ?? null;
  expect(await redirected('/assistant/ask'), 'Hỏi answers with a redirect, not a page that sends her on').toMatch(/\/assistant\/ask$/);
  await expect(page).toHaveURL(/\/assistant$/);
  expect(await redirected(`/assistant/ask/${id}`)).toMatch(new RegExp(`/assistant/ask/${id}$`));
  await expect(page, 'a saved conversation link opens the thread').toHaveURL(/\/assistant$/);
  await expect(page.getByTestId('question').last()).toContainText(Q1);

  const other = await (await browser.newContext()).newPage();
  await open(other, 'me.lane9@demo.esta.test', 'light', PHONE);
  const response = await other.goto(`/assistant/ask/${id}`);
  expect(response?.status(), 'RLS hides the conversation outside its household').toBe(404);
  await expect(other.getByTestId('conversation-not-found')).toContainText('Không tìm thấy cuộc hỏi đáp này');
  const html = (await response?.text()) ?? '';
  expect(html, 'none of the question or the answer reaches the page').not.toContain(Q1);
  expect(html).not.toContain('tiền thuê');
  expect(await seriousAxeViolations(other)).toEqual([]);
  await shot(other, 'p5-12-not-found-390x844-light');
  await other.context().close();
});

test('a new business day starts a new segment, which still knows the last turns and answers with August’s income', async ({ page, request }) => {
  await open(page, 'me.lane6@demo.esta.test', 'light', PHONE);
  await freshThread(page, 'me', 6);
  await sendAndTimeFirstSentence(page, Q1);
  await sendAndTimeFirstSentence(page, SEPTEMBER);
  const today = await latestConversation(page);
  await setClock(request, '2026-10-08T07:00:00+07:00');
  try {
    await sendAndTimeFirstSentence(page, AUGUST);
    const august = await incomeIn(page, 6, '08');
    expect(august, 'the seed received rent at Dĩ An in August').toBeGreaterThan(0);
    await expect(answer(page)).toContainText(`Tháng 8/2026, Dãy trọ Dĩ An đã thu ${formatVnd(money(august), 'vi')} tiền thuê.`);
    const tomorrow = await latestConversation(page);
    expect(tomorrow.id, 'the next day opened a new conversation').not.toBe(today.id);
    await expect(page.getByTestId('question'), 'all three show in one thread, in order').toHaveText([/Tháng này thu được/, /Còn tháng 9/, /Còn tháng 8/]);
    await shot(page, 'p5-12-segments-390x844-light');
  } finally {
    await setClock(request, '2026-10-07T07:00:00+07:00');
  }
});

const TOPIC_LANE = NOTE_LANE;
const LATE_COUNT = 'Khách này trễ mấy lần rồi?';
const MORTGAGE = 'Tài sản này đang thế chấp ở đâu?';
const CHIPS = ['Viết tin nhắn nhắc Hoàng Văn Em Demo', 'Hoàng Văn Em Demo đã trễ mấy lần?', 'Có nên gia hạn hợp đồng Căn hộ Thủ Đức không?'];

type AskedTopic = { readonly conversation_id: string; readonly topic_item_id: string | null; readonly topic_property_id: string | null };

/** Her latest message's topic columns, as she reads them under RLS. */
async function latestTopic(page: Page): Promise<AskedTopic | undefined> {
  const [row] = await memberRest<AskedTopic[]>(page, 'GET', 'messages?role=eq.user&select=conversation_id,topic_item_id,topic_property_id&order=created_at.desc&limit=1');
  return row;
}

async function answered(page: Page) {
  await expect(answer(page)).toHaveAttribute('data-status', 'done', { timeout: 30_000 });
  await settled(page.getByTestId('composer-send'));
}

test('thread case T3: Mẹ taps Trả lời on the Phòng 5 note, asks how often the tenant paid late, and the count comes from the payment records', async ({ page }) => {
  await servicePatch(page, `agent_items?id=eq.${NOTES.overdue.id}`, { status: 'new' });
  await open(page, `me.lane${TOPIC_LANE}@demo.esta.test`, 'light', PHONE);
  await freshThread(page, 'me', TOPIC_LANE);
  await page.goto('/assistant');
  await note(page, NOTES.overdue.title).getByRole('link', { name: `Trả lời ghi chú: ${NOTES.overdue.title}` }).click();
  await expect(page).toHaveURL(new RegExp(`/assistant\\?reply=${NOTES.overdue.id}$`));
  await expect(page.getByTestId('composer-topic')).toContainText(`Trả lời: ${NOTES.overdue.title}`);
  await expect(page.getByTestId('composer-suggestions'), 'a topic replaces the suggested replies').toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Viết cho Trợ lý' }), 'Trả lời takes her to the reply box').toBeFocused();
  await expect(page.getByTestId('composer-topic')).toBeInViewport();
  await pause(page);

  await sendInThread(page, LATE_COUNT);
  await answered(page);
  await expect(page).toHaveURL(/\/assistant$/);
  await expect(page.getByTestId('composer-topic'), 'the topic went with the message').toHaveCount(0);
  await expect(answer(page)).toContainText('Trong các hóa đơn năm nay đã đến hạn, Hoàng Văn Em Demo đã trả trễ 5 trên 8 hóa đơn, trung bình trễ 4 ngày.');
  await expect(answer(page)).toContainText(`Hóa đơn Phòng 5 đến hạn ngày 25/09/2026 vẫn còn nợ ${vnd('2.800.000')}.`);
  expect(await latestTopic(page)).toMatchObject({ topic_item_id: NOTES.overdue.id, topic_property_id: null });
  expect(await seriousAxeViolations(page)).toEqual([]);
  expect(await noSidewaysScroll(page), 'no sideways scroll').toBe(true);
  await shot(page, 'p5-13-reply-note-390x844-light');

  const quoted = page.getByTestId('question').last().getByTestId('question-topic');
  await expect(quoted).toHaveText(`Trả lời: ${NOTES.overdue.title}`);
  await quoted.click();
  await expect(page).toHaveURL(new RegExp(`/assistant\\?note=${NOTES.overdue.id}$`));
  await expect(note(page, NOTES.overdue.title), 'the quoted title opens the thread at the note').toBeInViewport();
});

test('thread case T4: in dark, Mẹ taps Hỏi Trợ lý về tài sản này on Đất Bảo Lộc, and the answer names the bank its Pháp lý tab shows', async ({ page }) => {
  const property = laneProperty(TOPIC_LANE, 'bao-loc');
  await open(page, `me.lane${TOPIC_LANE}@demo.esta.test`, 'dark', PHONE);
  await freshThread(page, 'me', TOPIC_LANE);
  await page.goto(`/properties/${property}`);
  await shot(page, 'p5-13-property-header-390x844-dark');
  await page.getByRole('link', { name: 'Hỏi Trợ lý về tài sản này' }).click();
  await expect(page).toHaveURL(new RegExp(`/assistant\\?about=${property}$`));
  await expect(page.getByTestId('composer-topic')).toContainText('Về: Đất Bảo Lộc');

  await sendInThread(page, MORTGAGE);
  await answered(page);
  await expect(answer(page)).toContainText(/^Sổ của Đất Bảo Lộc đang thế chấp tại .+, khoản vay .+, đăng ký ngày 12\/03\/2024\./);
  const bank = /thế chấp tại (.+), khoản vay/.exec(await answer(page).innerText())?.[1] ?? '';
  expect(await latestTopic(page)).toMatchObject({ topic_item_id: null, topic_property_id: property });
  await expect(page.getByTestId('question').last().getByTestId('question-topic')).toHaveText('Về: Đất Bảo Lộc');
  expect(await seriousAxeViolations(page)).toEqual([]);
  await shot(page, 'p5-13-property-topic-390x844-dark');
  await page.setViewportSize(DESKTOP);
  await shot(page, 'p5-13-property-topic-1440x900-dark');

  await answer(page).getByRole('link', { name: 'pháp lý của Đất Bảo Lộc' }).click();
  await expect(page).toHaveURL(new RegExp(`/properties/${property}/legal`));
  await expect(page.getByRole('main'), 'the bank is the one on the Pháp lý tab').toContainText(bank);
});

test('Mẹ sees three suggested replies from her open notes, and one tap sends each with its note as the topic', async ({ page }) => {
  await servicePatch(page, `agent_items?id=in.(${NOTES.overdue.id},${NOTES.leaseEnding.id})`, { status: 'new' });
  await open(page, `me.lane${TOPIC_LANE}@demo.esta.test`, 'light', PHONE);
  await freshThread(page, 'me', TOPIC_LANE);
  await page.goto('/assistant');
  const chips = page.getByTestId('composer-suggestion');
  await expect(chips, 'the most severe notes first, newest first, at most three').toHaveText(CHIPS);
  expect(await seriousAxeViolations(page)).toEqual([]);
  expect(await noSidewaysScroll(page), 'no sideways scroll').toBe(true);
  await page.setViewportSize(DESKTOP);
  await shot(page, 'p5-13-chips-1440x900-light');
  await page.setViewportSize(PHONE);

  await chips.first().click();
  await expect(page.getByTestId('question').last()).toContainText(CHIPS[0] ?? '');
  await answered(page);
  const draft = `Chào Hoàng Văn Em Demo, tiền thuê Phòng 5 ở Dãy trọ Dĩ An đến hạn ngày 25/09/2026 đã quá hạn 12 ngày, hiện còn ${vnd('2.800.000')}.`;
  await expect(answer(page)).toContainText(draft);
  await expect(page.getByTestId('question').last().getByTestId('question-topic')).toHaveText(`Trả lời: ${NOTES.overdue.title}`);
  expect(await latestTopic(page)).toMatchObject({ topic_item_id: NOTES.overdue.id });
  await shot(page, 'p5-13-suggestion-390x844-light');

  await chips.nth(1).click();
  await answered(page);
  await expect(answer(page)).toContainText('Năm nay Hoàng Văn Em Demo đã trả trễ 5 trên 8 hóa đơn đã đến hạn, trung bình trễ 4 ngày.');

  await chips.nth(2).click();
  await answered(page);
  await expect(answer(page)).toContainText(`Hợp đồng Căn hộ Thủ Đức với Phạm Thị Lan Demo hết hạn ngày 01/11/2026, còn 25 ngày. Tiền thuê hiện là ${vnd('9.000.000')} mỗi tháng`);
  expect(await latestTopic(page)).toMatchObject({ topic_item_id: NOTES.leaseEnding.id });
  const asked = await memberRest<{ conversation_id: string }[]>(page, 'GET', 'messages?role=eq.user&select=conversation_id');
  expect(new Set(asked.map(({ conversation_id }) => conversation_id)).size, 'each topic leads its own conversation').toBe(3);

  await page.goto('/collections');
  await expect(boardRow(page, 'overdue', 'Phòng 5, Dãy trọ Dĩ An'), 'the draft owes what the board shows').toContainText(vnd('2.800.000'));

  await servicePatch(page, `agent_items?id=eq.${NOTES.overdue.id}`, { status: 'dismissed' });
  try {
    await page.goto('/assistant');
    await expect(chips, 'a hidden note offers no reply').toHaveText([CHIPS[2] ?? '', 'Làm sao cho thuê Kho Biên Hòa nhanh hơn?']);
  } finally {
    await servicePatch(page, `agent_items?id=eq.${NOTES.overdue.id}`, { status: 'new' });
  }
});

test('Mẹ starts a reply, taps Bỏ, and her follow-up joins the open conversation with no topic', async ({ page }) => {
  await open(page, `me.lane${TOPIC_LANE}@demo.esta.test`, 'light', PHONE);
  await freshThread(page, 'me', TOPIC_LANE);
  await sendAndTimeFirstSentence(page, Q1);
  const first = await latestConversation(page);

  await page.goto(`/assistant?reply=${NOTES.overdue.id}`);
  await page.getByRole('button', { name: `Bỏ chủ đề ${NOTES.overdue.title}` }).click();
  await expect(page).toHaveURL(/\/assistant$/);
  await expect(page.getByTestId('composer-topic')).toHaveCount(0);
  await shot(page, 'p5-13-clear-topic-390x844-light');

  await sendInThread(page, SEPTEMBER);
  await answered(page);
  await expect(answer(page)).toContainText(`Tháng 9/2026, Dãy trọ Dĩ An đã thu ${formatVnd(money(await incomeIn(page, TOPIC_LANE, '09')), 'vi')} tiền thuê.`);
  expect(await latestTopic(page)).toEqual({ conversation_id: first.id, topic_item_id: null, topic_property_id: null });
  await expect(page.getByTestId('question').last().getByTestId('question-topic')).toHaveCount(0);
});

test('the database refuses a topic she cannot open (another household’s note or property, an operator note, a forged kind) and a second topic while one streams', async ({ page }) => {
  await open(page, `me.lane${TOPIC_LANE}@demo.esta.test`, 'light', DESKTOP);
  await freshThread(page, 'me', TOPIC_LANE);
  const ask = (topic: unknown, question = LATE_COUNT) =>
    memberCall(page, 'POST', 'rpc/ask_in_thread', { p_household_id: laneHousehold(TOPIC_LANE), p_question_id: crypto.randomUUID(), p_question: question, p_topic: topic });
  const forbidden = { code: '42501', message: 'ESTA_FORBIDDEN' };
  const invalid = { code: '22023', message: 'ESTA_ASK_INVALID' };
  for (const [topic, refusal] of [
    [{ kind: 'item', id: seedId('seed:agent-item:W1-lane-8') }, forbidden],
    [{ kind: 'item', id: OPERATOR_NOTE.id }, forbidden],
    [{ kind: 'property', id: laneProperty(8, 'bao-loc') }, forbidden],
    [{ kind: 'invoice', id: NOTES.overdue.id }, invalid],
    [{ kind: 'item', id: NOTES.overdue.id, title: 'x' }, invalid],
  ] as const) {
    const refused = await ask(topic);
    expect(refused.status(), JSON.stringify(topic)).toBe(refusal === forbidden ? 403 : 400);
    expect(await refused.json()).toMatchObject(refusal);
  }
  expect(await memberRest<unknown[]>(page, 'GET', 'messages?select=id'), 'no message was written').toEqual([]);

  const both = await Promise.all([ask({ kind: 'item', id: NOTES.overdue.id }), ask({ kind: 'property', id: laneProperty(TOPIC_LANE, 'bao-loc') }, MORTGAGE)]);
  expect(both.filter((response) => response.ok()), 'two topics sent at once: one asks, though each starts its own segment').toHaveLength(1);
  expect(await both.find((response) => !response.ok())?.json()).toMatchObject({ code: '55000', message: 'ESTA_ASK_BUSY' });
  expect(await memberRest<unknown[]>(page, 'GET', 'messages?role=eq.user&select=id')).toHaveLength(1);
  await expect.poll(async () => (await memberRest<{ status: string }[]>(page, 'GET', 'messages?role=eq.assistant&select=status'))[0]?.status, { timeout: 30_000 }).toBe('done');
});
