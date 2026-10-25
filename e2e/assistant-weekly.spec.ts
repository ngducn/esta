import { expect, test, type Page } from '@playwright/test';
import { seedId } from '../supabase/seed/generator/ids.ts';
import { startAgentWorker, stopAndForget, type AgentWorker } from './helpers/agent-worker';
import { setClock } from './helpers/test-clock';
import { DESKTOP, open, PHONE, serviceGet, serviceUpsert, seriousAxeViolations, shot, vnd } from './helpers/wizard';

// The scheduler queues on the slot's one clock, so the spec runs in the `clock` project.
test.describe.configure({ mode: 'serial' });

const DEMO = seedId('seed:household:demo');
const SUNDAY = '2026-10-11';
const WEEKLY_KEY = `weekly_review:${DEMO}:2026-W41`;
const RING_ROAD = 'https://tintuc.example.vn/ha-tang/vanh-dai-3-doan-qua-di-an-sap-khoi-cong';

let worker: AgentWorker | undefined;

test.afterAll(async ({ request }) => {
  await stopAndForget(worker);
  await setClock(request, null);
});

/**
 * Only the full seed's own household has a weekly recording for Sunday 2026-10-11, and no household has one for that
 * day's daily jobs. Every other job the scheduler would queue that morning is queued as cancelled first, so the
 * worker runs the one weekly review and leaves every lane's inbox as the other specs expect it.
 */
async function onlyTheSeedsWeeklyReview(page: Page) {
  const households = await serviceGet<{ id: string }[]>(page, 'households?select=id');
  const others = [
    ...households.flatMap(({ id }) => ['research_scan', 'portfolio_watch', 'morning_brief'].map((kind) => ({ kind, household_id: id, idempotency_key: `${kind}:${id}:${SUNDAY}` }))),
    ...households.filter(({ id }) => id !== DEMO).map(({ id }) => ({ kind: 'weekly_review', household_id: id, idempotency_key: `weekly_review:${id}:2026-W41` })),
  ];
  await serviceUpsert(page, 'agent_jobs?on_conflict=idempotency_key', others.map((job) => ({ ...job, status: 'cancelled', run_after: `${SUNDAY}T00:00:00Z` })));
}

/** The Vành đai 3 item the 06:00 research scan of 2026-10-07 stores, which the weekly rent change cites. */
async function storedRingRoadItem(page: Page) {
  await serviceUpsert(page, 'research_items?on_conflict=household_id,url_normalized', {
    household_id: DEMO,
    url_normalized: RING_ROAD,
    source_url: RING_ROAD,
    source_name: 'Tin tức Demo',
    published_on: '2026-10-05',
    title_vi: 'Sắp khởi công Vành đai 3 đoạn qua Phường Dĩ An',
    summary_vi: 'Thành phố đã duyệt kế hoạch thi công Vành đai 3 đoạn qua Phường Dĩ An, dự kiến khởi công tháng 12/2026.',
    why_it_matters_vi: 'Dãy trọ Dĩ An nằm gần tuyến đường, nên giá thuê phòng có thể tăng khi đường thông xe.',
    kind: 'infrastructure',
    relevance: 0.9,
    created_at: '2026-10-06T23:00:00Z',
  });
}

const weekly = (page: Page) => page.locator('[data-testid="inbox-item"][data-kind="weekly"]');
const card = (page: Page, title: string) => page.getByTestId('inbox-item').filter({ has: page.getByRole('heading', { name: title, exact: true }) });

test('on Sunday at 08:05 Hộp thư holds one weekly review with the board’s month figures and its three proposals', async ({ page, request }) => {
  await setClock(request, `${SUNDAY}T08:00:00+07:00`);
  await onlyTheSeedsWeeklyReview(page);
  await storedRingRoadItem(page);
  worker = await startAgentWorker({ schedule: true });
  await expect
    .poll(async () => (await serviceGet<{ status: string }[]>(page, `agent_jobs?idempotency_key=eq.${WEEKLY_KEY}&select=status`)).map(({ status }) => status), { timeout: 90_000 })
    .toEqual(['done']);
  const [job] = await serviceGet<{ id: string }[]>(page, `agent_jobs?idempotency_key=eq.${WEEKLY_KEY}&select=id`);
  const made = await serviceGet<{ kind: string; title: string }[]>(page, `agent_items?job_id=eq.${job?.id}&select=kind,title&order=created_at`);
  expect(made.map(({ kind }) => kind)).toEqual(['weekly', 'proposal', 'proposal', 'proposal']);
  await setClock(request, `${SUNDAY}T08:05:00+07:00`);

  await open(page, 'me@demo.esta.test', 'light', DESKTOP);
  await page.goto('/');
  const figure = page.getByTestId('month-figure');
  const [collected, billed] = [Number(await figure.getAttribute('data-collected-vnd')), Number(await figure.getAttribute('data-billed-vnd'))];
  const money = (amount: number) => vnd(amount.toLocaleString('vi-VN'));

  await page.goto('/assistant');
  await expect(weekly(page)).toHaveCount(1);
  await expect(weekly(page).getByRole('heading', { level: 3 })).toHaveText(`Tổng kết tuần: tháng 10/2026 đã thu ${money(collected)} trên ${money(billed)}`);
  await expect(weekly(page).locator('strong')).toHaveText(['Thu tiền tháng này', 'Tháng tới', 'Phòng trống', 'Chi phí đáng chú ý', 'Thuế năm nay']);
  await expect(weekly(page).locator('[data-testid="note-link"][data-ok="false"]')).toHaveCount(0);
  for (const { title } of made.slice(1)) await expect(card(page, title)).toHaveAttribute('data-kind', 'proposal');
  expect(await seriousAxeViolations(page)).toEqual([]);
  await shot(page, 'p5-08-weekly-note-1440x900-light');
  await page.setViewportSize(PHONE);
  await weekly(page).scrollIntoViewIfNeeded();
  await shot(page, 'p5-08-weekly-note-390x844-light');
});

test('Mẹ opens the weekly rent change on her phone in dark and finds the stored Vành đai 3 item it cites', async ({ page }) => {
  const [job] = await serviceGet<{ id: string }[]>(page, `agent_jobs?idempotency_key=eq.${WEEKLY_KEY}&select=id`);
  const [rent] = await serviceGet<{ title: string }[]>(page, `agent_items?job_id=eq.${job?.id}&proposal->>type=eq.suggest_rent_change&select=title`);
  await open(page, 'me@demo.esta.test', 'dark', PHONE);
  await page.goto('/assistant');
  const proposal = card(page, rent?.title ?? '');
  await expect(proposal.getByTestId('citation-chip')).toHaveText([/Tin tức Demo · 05\/10\/2026$/]);
  await expect(proposal.getByRole('link', { name: /Tin tức Demo/ })).toHaveAttribute('href', RING_ROAD);
  const stored = await serviceGet<unknown[]>(page, `research_items?household_id=eq.${DEMO}&url_normalized=eq.${encodeURIComponent(RING_ROAD)}&select=id`);
  expect(stored, 'the chip’s URL is a stored research item').toHaveLength(1);
  await proposal.scrollIntoViewIfNeeded();
  expect(await seriousAxeViolations(page)).toEqual([]);
  await shot(page, 'p5-08-weekly-citations-390x844-dark');
});
