import { expect, test, type Page } from '@playwright/test';
import { formatVnd } from '../packages/core/src/format/index.ts';
import { vnd as money } from '../packages/core/src/money/vnd.ts';
import { seedId } from '../supabase/seed/generator/ids.ts';
import { workerAt } from './helpers/agent-worker';
import { memberCall, memberRest } from './helpers/auth-api';
import { boardRow } from './helpers/board';
import { laneHousehold, laneProperty } from './helpers/seed';
import { answer, freshThread, incomeIn, laneNotes, laneOperatorNote, latestConversation, noteCard, sendInThread } from './helpers/thread';
import { DESKTOP, noSidewaysScroll, open, PHONE, recordForPr, servicePatch, seriousAxeViolations, settled, shot, vnd } from './helpers/wizard';

test.describe.configure({ mode: 'serial' });

const pause = recordForPr();
const TOPIC_LANE = 9;
const NOTES = laneNotes(TOPIC_LANE);
const OPERATOR_NOTE = laneOperatorNote(TOPIC_LANE);
const Q1 = 'Tháng này thu được bao nhiêu từ Dĩ An?';
const SEPTEMBER = 'Còn tháng 9 thì sao?';
const LATE_COUNT = 'Khách này trễ mấy lần rồi?';
const MORTGAGE = 'Tài sản này đang thế chấp ở đâu?';
const CHIPS = ['Viết tin nhắn nhắc Hoàng Văn Em Demo', 'Hoàng Văn Em Demo đã trễ mấy lần?', 'Có nên gia hạn hợp đồng Căn hộ Thủ Đức không?'];

type AskedTopic = { readonly conversation_id: string; readonly topic_item_id: string | null; readonly topic_property_id: string | null };

async function latestTopic(page: Page): Promise<AskedTopic | undefined> {
  const [row] = await memberRest<AskedTopic[]>(page, 'GET', 'messages?role=eq.user&select=conversation_id,topic_item_id,topic_property_id&order=created_at.desc&limit=1');
  return row;
}

async function answered(page: Page) {
  await expect(answer(page)).toHaveAttribute('data-status', 'done', { timeout: 30_000 });
  await settled(page.getByTestId('composer-send'));
}

workerAt('2026-10-07T07:00:00+07:00');

test('thread case T3: Mẹ taps Trả lời on the Phòng 5 note, asks how often the tenant paid late, and the count comes from the payment records', async ({ page }) => {
  await servicePatch(page, `agent_items?id=eq.${NOTES.overdue.id}`, { status: 'new' });
  await open(page, `me.lane${TOPIC_LANE}@demo.esta.test`, 'light', PHONE);
  await freshThread(page, 'me', TOPIC_LANE);
  await page.goto('/assistant');
  await noteCard(page, NOTES.overdue.title).getByRole('link', { name: `Trả lời ghi chú: ${NOTES.overdue.title}` }).click();
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
  await expect(noteCard(page, NOTES.overdue.title), 'the quoted title opens the thread at the note').toBeInViewport();
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
  await sendInThread(page, Q1);
  await answered(page);
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
