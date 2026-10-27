import { expect, test, type Page } from '@playwright/test';
import { startAgentWorker, stopAndForget, type AgentWorker } from './helpers/agent-worker';
import { laneHousehold } from './helpers/seed';
import { setClock } from './helpers/test-clock';
import { DESKTOP, open, serviceDelete, serviceGet, servicePatch, seriousAxeViolations, shot } from './helpers/wizard';

// The worker and the test clock are one per slot, so the spec runs in the `clock` project.
test.describe.configure({ mode: 'serial' });

const LANE = 8;
const household = laneHousehold(LANE);
const started = '2026-10-07T07:00:00+07:00';
// Past the watch's 3 minute timeout plus 2 minutes, so the next claim takes the job the killed worker held.
const restarted = '2026-10-07T07:06:00+07:00';
const today = encodeURIComponent('2026-10-07T00:00:00+07:00');

let worker: AgentWorker | undefined;

test.afterAll(async ({ request }) => {
  await stopAndForget(worker);
  await setClock(request, null);
});

type Job = { readonly id: string; readonly status: string; readonly attempts: number };

const watchItems = (page: Page) =>
  serviceGet<{ dedupe_key: string; job_id: string | null }[]>(page, `agent_items?household_id=eq.${household}&dedupe_key=like.watch*&created_at=gte.${today}&select=dedupe_key,job_id`);

test('a worker killed after the watch’s first note re-runs the job once, and every note and run exists exactly once (AGT-1)', async ({ page, request }) => {
  await setClock(request, started);
  await servicePatch(page, `agent_jobs?household_id=eq.${household}&kind=eq.portfolio_watch&status=in.(queued,running)`, { status: 'cancelled' });
  await serviceDelete(page, `agent_items?household_id=eq.${household}&dedupe_key=like.watch*&created_at=gte.${today}`);
  worker = await startAgentWorker({ crashOn: /\[agent\] create_item ok /m });

  await open(page, `ryan.lane${LANE}@demo.esta.test`, 'dark', DESKTOP);
  await page.goto('/assistant/diagnostics');
  await page.getByRole('button', { name: 'Chạy theo dõi' }).click();
  await worker.exited();
  expect(worker.running(), 'the worker died mid-job').toBe(false);
  const [held] = await serviceGet<Job[]>(page, `agent_jobs?household_id=eq.${household}&kind=eq.portfolio_watch&order=created_at.desc&limit=1&select=id,status,attempts`);
  if (held === undefined) throw new Error('the watch job was not queued');
  expect(held).toMatchObject({ status: 'running', attempts: 1 });
  expect(await watchItems(page), 'the kill landed after one note').toHaveLength(1);

  await setClock(request, restarted);
  worker = await startAgentWorker();
  await expect
    .poll(async () => (await serviceGet<Job[]>(page, `agent_jobs?id=eq.${held.id}&select=id,status,attempts`))[0], { timeout: 60_000 })
    .toMatchObject({ status: 'done', attempts: 2 });

  const items = await watchItems(page);
  expect(items, 'four watch notes, each once').toHaveLength(4);
  expect(new Set(items.map((item) => item.dedupe_key)).size).toBe(4);
  expect(items.every((item) => item.job_id === held.id), 'every note came from the one job').toBe(true);
  const runs = await serviceGet<unknown[]>(page, `agent_runs?job_id=eq.${held.id}&select=id`);
  expect(runs, 'the killed attempt left no run, the finished one left one').toHaveLength(1);

  await page.reload();
  await expect(page.getByTestId('watch-status')).toHaveAttribute('data-status', 'done');
  await page.goto('/assistant');
  const notes = page.getByTestId('inbox-item').filter({ has: page.getByTestId('note-dedupe').getByText(/^watch(_digest)?:.*2026-10-07$/) });
  await expect(notes).toHaveCount(4);
  expect(await seriousAxeViolations(page)).toEqual([]);
  await shot(page, 'p5-08-crash-once-1440x900-dark');
});
