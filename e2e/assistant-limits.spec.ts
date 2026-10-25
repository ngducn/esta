import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';
import { startAgentWorker, stopAndForget, type AgentWorker } from './helpers/agent-worker';
import { laneHousehold } from './helpers/seed';
import { setClock } from './helpers/test-clock';
import { DESKTOP, open, PHONE, serviceGet, servicePatch, seriousAxeViolations, shot, toast } from './helpers/wizard';

// One worker, one heartbeat table and one test clock per slot, so the spec runs in the `clock` project.
test.describe.configure({ mode: 'serial' });

const CASES = join(import.meta.dirname, '..', 'fixtures', 'agent-replay-cases');
const Q1 = 'Tháng này thu được bao nhiêu từ Dĩ An?';
const DEFERRED = 'Hôm nay Trợ lý đã trả lời đủ câu hỏi. Câu hỏi này sẽ được trả lời vào ngày mai.';
const PAUSED = 'Trợ lý tạm dừng do hết hạn mức sử dụng. Việc mới sẽ chạy khi hạn mức mở lại.';
const WATCH_FAILED = 'Trợ lý chưa xem được danh mục hôm nay';
const MIDNIGHT = '2026-10-08T00:00:00+07:00';
const at = (time: string) => `2026-10-07T${time}:00+07:00`;

type Job = { readonly id: string; readonly status: string; readonly attempts: number; readonly run_after: string; readonly idempotency_key: string | null };
type Settings = { readonly agent: Record<string, unknown> };

let worker: AgentWorker | undefined;

/** Each start is a new worker id, and under a frozen clock its beat ties the stopped worker's, so that row goes first. */
async function restartWorker(replayDir?: string) {
  await stopAndForget(worker);
  worker = await startAgentWorker(replayDir === undefined ? {} : { replayDir });
}

test.afterAll(async ({ request }) => {
  await stopAndForget(worker);
  await setClock(request, null);
});

const JOB = 'select=id,status,attempts,run_after,idempotency_key';
const latestJob = async (page: Page, lane: number, kind: string) =>
  (await serviceGet<Job[]>(page, `agent_jobs?household_id=eq.${laneHousehold(lane)}&kind=eq.${kind}&order=created_at.desc&limit=1&${JOB}`))[0];

/** Waits until the job has made `attempts` attempts and is no longer running. */
async function jobAfter(page: Page, id: string, attempts: number): Promise<Job> {
  const read = async () => (await serviceGet<Job[]>(page, `agent_jobs?id=eq.${id}&${JOB}`))[0];
  const settled = async () => {
    const job = await read();
    return job === undefined ? null : [job.attempts, job.status !== 'running'];
  };
  await expect.poll(settled, { timeout: 30_000 }).toEqual([attempts, true]);
  return (await read()) as Job;
}

const sameInstant = (stored: string, expected: string) => expect(Date.parse(stored), `${stored} is ${expected}`).toBe(Date.parse(expected));

/** Ryan taps Chạy theo dõi, once no earlier watch of the lane is still waiting, and gets the job it queued. */
async function runWatch(page: Page, lane: number): Promise<string> {
  await servicePatch(page, `agent_jobs?household_id=eq.${laneHousehold(lane)}&kind=eq.portfolio_watch&status=in.(queued,running)`, { status: 'cancelled' });
  const before = (await latestJob(page, lane, 'portfolio_watch'))?.id;
  await page.goto('/assistant');
  await page.getByRole('button', { name: 'Chạy theo dõi' }).click();
  await expect.poll(async () => (await latestJob(page, lane, 'portfolio_watch'))?.id).not.toBe(before);
  const queued = await latestJob(page, lane, 'portfolio_watch');
  if (queued === undefined) throw new Error(`lane ${lane} queued no watch`);
  return queued.id;
}

async function ask(page: Page, question: string) {
  await page.goto('/assistant/ask');
  await page.getByRole('textbox', { name: 'Câu hỏi của bạn' }).fill(question);
  await page.getByTestId('ask-send').click();
  await expect(page).toHaveURL(/\/assistant\/ask\/[0-9a-f-]{36}$/);
}

test('with the ask cap two answers away, Mẹ’s third question today waits for tomorrow and says so in Esta’s words', async ({ page, request }) => {
  await setClock(request, at('07:00'));
  await restartWorker();
  const household = laneHousehold(3);
  const [settings] = await serviceGet<Settings[]>(page, `household_settings?household_id=eq.${household}&select=agent`);
  const agent = settings?.agent ?? {};
  const startedToday = await serviceGet<unknown[]>(page, `agent_jobs?household_id=eq.${household}&kind=eq.ask&started_at=gte.${encodeURIComponent(at('00:00'))}&select=id`);
  await servicePatch(page, `household_settings?household_id=eq.${household}`, { agent: { ...agent, daily_caps: { ask: startedToday.length + 2 } } });
  try {
    await open(page, 'me.lane3@demo.esta.test', 'light', PHONE);
    for (let answered = 0; answered < 2; answered += 1) {
      await ask(page, Q1);
      await expect(page.getByTestId('answer')).toHaveAttribute('data-status', 'done', { timeout: 30_000 });
    }
    await ask(page, Q1);
    await expect(page.getByTestId('answer')).toHaveAttribute('data-status', 'deferred', { timeout: 30_000 });
    await expect(page.getByTestId('answer-line')).toHaveText(DEFERRED);
    await page.reload();
    await expect(page.getByTestId('answer-line'), 'the deferred line holds on a fresh load').toHaveText(DEFERRED);
    await expect(page.getByTestId('follow-up'), 'no follow-up box promises an answer today').toHaveCount(0);
    const deferred = await latestJob(page, 3, 'ask');
    expect(deferred?.status).toBe('queued');
    sameInstant(deferred?.run_after ?? '', MIDNIGHT);
    expect(await seriousAxeViolations(page)).toEqual([]);
    await shot(page, 'p5-08-ask-cap-390x844-light');
    if (deferred !== undefined) await servicePatch(page, `agent_jobs?id=eq.${deferred.id}`, { status: 'cancelled' });
  } finally {
    await servicePatch(page, `household_settings?household_id=eq.${household}`, { agent });
  }
});

test('a usage limit pauses the assistant: Mẹ’s Home says so, the watch waits one minute, and it runs once the limit lifts', async ({ page, browser, request }) => {
  await setClock(request, at('07:00'));
  await restartWorker(join(CASES, 'usage-limit'));
  await open(page, 'ryan.lane4@demo.esta.test', 'light', DESKTOP);
  const watch = await runWatch(page, 4);
  const limited = await jobAfter(page, watch, 1);
  expect(limited.status).toBe('queued');
  sameInstant(limited.run_after, at('07:01'));

  const mother = await (await browser.newContext()).newPage();
  await open(mother, 'me.lane4@demo.esta.test', 'dark', PHONE);
  await expect(async () => {
    await mother.goto('/');
    await expect(mother.getByTestId('worker-status')).toHaveAttribute('data-status', 'paused', { timeout: 500 });
  }).toPass({ timeout: 10_000 });
  await expect(mother.getByTestId('worker-status')).toHaveText(PAUSED);
  expect(await seriousAxeViolations(mother)).toEqual([]);
  await shot(mother, 'p5-08-usage-limit-390x844-dark');

  await restartWorker();
  await setClock(request, at('07:02'));
  const ran = await jobAfter(page, watch, 2);
  expect(ran.status).toBe('done');
  await expect(async () => {
    await mother.goto('/assistant');
    await expect(mother.getByTestId('worker-status')).toHaveAttribute('data-status', 'online', { timeout: 500 });
  }).toPass({ timeout: 10_000 });
  await mother.goto('/');
  await expect(mother.getByTestId('worker-status'), 'Home carries no notice once the assistant runs again').toHaveCount(0);
  await mother.context().close();
});

test('a watch that fails four times leaves Ryan a Thử lại, and one tap runs it again under the :retry:1 key', async ({ page, request }) => {
  await setClock(request, at('07:00'));
  await restartWorker(join(CASES, 'always-fail'));
  await open(page, 'ryan.lane5@demo.esta.test', 'dark', DESKTOP);
  const watch = await runWatch(page, 5);
  for (const [attempts, next] of [
    [1, '07:01'],
    [2, '07:06'],
    [3, '07:31'],
  ] as const) {
    const waiting = await jobAfter(page, watch, attempts);
    expect(waiting.status, `attempt ${attempts} waits`).toBe('queued');
    sameInstant(waiting.run_after, at(next));
    await setClock(request, at(next));
  }
  const failed = await jobAfter(page, watch, 4);
  expect(failed.status).toBe('failed');

  await restartWorker();
  await page.goto('/assistant');
  const item = page.getByTestId('inbox-item').filter({ has: page.getByRole('heading', { name: WATCH_FAILED, exact: true }) });
  await expect(item).toHaveCount(1);
  await expect(item.getByTestId('note-retry')).toHaveText('Thử lại');
  expect(await seriousAxeViolations(page)).toEqual([]);
  await shot(page, 'p5-08-retry-1440x900-dark');

  await item.getByTestId('note-retry').click();
  await expect(toast(page)).toContainText('Trợ lý sẽ chạy lại trong ít phút.');
  await expect(item, 'the item is done once the job is queued again').toHaveCount(0);
  const retryKey = `portfolio_watch:${failed.id}:retry:1`;
  await expect
    .poll(async () => (await serviceGet<Job[]>(page, `agent_jobs?idempotency_key=eq.${retryKey}&select=status`)).map((job) => job.status), { timeout: 30_000 })
    .toEqual(['done']);
  await page.reload();
  await expect(page.getByTestId('watch-status')).toHaveAttribute('data-status', 'done');
});
