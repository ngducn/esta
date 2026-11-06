import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { formatVnd } from '../packages/core/src/format/index.ts';
import { vnd as money } from '../packages/core/src/money/vnd.ts';
import { workerAt } from './helpers/agent-worker';
import { memberRest } from './helpers/auth-api';
import { laneLease } from './helpers/seed';
import { answer, freshThread, sendInThread } from './helpers/thread';
import { DESKTOP, noSidewaysScroll, open, PHONE, seriousAxeViolations, settled, shot } from './helpers/wizard';

test.describe.configure({ mode: 'serial' });

const RAISE_ROOM = 'Nếu tăng tiền phòng 2 ở Dĩ An lên 4tr thì mỗi năm thu thêm bao nhiêu?';
const LOAN = 'Vay 2 tỷ trong 15 năm, lãi 9%/năm thì mỗi tháng trả bao nhiêu?';
const HOME_LOAN = 'Lãi suất vay mua nhà bây giờ khoảng bao nhiêu?';
const LOAN_AT_QUOTED_RATE = 'Với lãi suất đó, vay 2 tỷ trong 15 năm mỗi tháng trả bao nhiêu?';

workerAt('2026-10-07T07:00:00+07:00');

const truth = JSON.parse(readFileSync(join(import.meta.dirname, '../apps/agent/test/golden/ask-ground-truth.json'), 'utf8')) as Array<{ question: string; figure: string; value: string }>;
const groundTruth = (question: string, figure: string) => {
  const row = truth.find((candidate) => candidate.question === question && candidate.figure === figure);
  if (row === undefined) throw new Error(`ask-ground-truth.sql has no ${question} ${figure}`);
  return money(Number(row.value));
};

/** Sends `message` in the thread and waits until its answer is done. */
async function sendAndWaitForAnswer(page: Page, message: string): Promise<void> {
  await page.goto('/assistant');
  await sendInThread(page, message);
  await expect(answer(page)).toHaveAttribute('data-status', 'done', { timeout: 30_000 });
  await settled(page.getByTestId('composer-send'));
}

test('thread case T5: Mẹ asks what raising Phòng 2 to 4tr brings in a year and reads the gain with its working under it', async ({ page }) => {
  await open(page, 'me.lane2@demo.esta.test', 'light', PHONE);
  await freshThread(page, 'me', 2);
  await sendAndWaitForAnswer(page, RAISE_ROOM);
  const [lease] = await memberRest<{ rent_vnd: number }[]>(page, 'GET', `leases?id=eq.${laneLease(2, 'di-an', 2)}&select=rent_vnd`);
  const rent = money(lease?.rent_vnd ?? 0);
  const monthly = money(4_000_000 - rent);
  const yearly = money((4_000_000 - rent) * 12);
  const [from, to, gain, year] = [rent, money(4_000_000), monthly, yearly].map((amount) => formatVnd(amount, 'vi'));
  await expect(answer(page)).toContainText(`mỗi tháng thu thêm ${gain}, tức mỗi năm thu thêm ${year}.`);
  expect(year, 'the gain is the ground truth of the seed').toBe(formatVnd(groundTruth('t5', 'di-an room 2 yearly gain at 4tr'), 'vi'));
  const working = answer(page).getByTestId('answer-working').getByRole('listitem');
  await expect(working).toHaveText([`Cách tính: ${to} − ${from} = ${gain}`, `Cách tính: ${gain} × 12 = ${year}`]);
  expect(await seriousAxeViolations(page)).toEqual([]);
  expect(await noSidewaysScroll(page), 'no sideways scroll').toBe(true);
  await shot(page, 'p5-15-working-390x844-light');
});

test('thread case T6: Mẹ asks the monthly payment of a loan she types, and reads it with all three inputs in the working', async ({ page }) => {
  await open(page, 'me.lane3@demo.esta.test', 'dark', PHONE);
  await freshThread(page, 'me', 3);
  await sendAndWaitForAnswer(page, LOAN);
  const paid = formatVnd(groundTruth('t6', 'monthly payment of 2 tỷ over 15 năm at 9%'), 'vi');
  await expect(answer(page)).toContainText(`mỗi tháng trả ${paid}.`);
  const working = answer(page).getByTestId('answer-working');
  await expect(working).toContainText(`${formatVnd(money(2_000_000_000), 'vi')}, 9%/năm, 180 tháng → ${paid}/tháng`);
  expect(await seriousAxeViolations(page)).toEqual([]);
  await shot(page, 'p5-15-loan-390x844-dark');
});

test('thread case T7 follow-up: Ryan applies the quoted home loan rate to a loan he types, and the working names the rate beside its source chip', async ({ page }) => {
  await open(page, 'ryan.lane4@demo.esta.test', 'light', DESKTOP);
  await freshThread(page, 'ryan', 4);
  await sendAndWaitForAnswer(page, HOME_LOAN);
  await sendAndWaitForAnswer(page, LOAN_AT_QUOTED_RATE);
  const paid = formatVnd(groundTruth('t7', 'monthly payment of 2 tỷ over 15 năm at 7,5%'), 'vi');
  await expect(answer(page)).toContainText(`mỗi tháng trả ${paid}.`);
  await expect(answer(page).getByTestId('citation-chip'), 'the page was fetched again in this turn').toHaveAttribute('href', 'https://tin-demo.example/lai-suat-vay-mua-nha');
  await expect(answer(page).getByTestId('answer-working')).toContainText(`7,5%/năm, 180 tháng → ${paid}/tháng`);
  expect(await seriousAxeViolations(page)).toEqual([]);
  await shot(page, 'p5-15-web-calc-1440x900-light');
});
