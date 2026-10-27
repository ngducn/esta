import { expect, test } from '@playwright/test';
import { seedId } from '../supabase/seed/generator/ids.ts';
import { proposalCard } from './helpers/proposals';
import { laneHousehold } from './helpers/seed';
import { setClock } from './helpers/test-clock';
import { pinnedArea, pinnedRow } from './helpers/thread';
import { open, PHONE, serviceGet, servicePatch, serviceUpsert, seriousAxeViolations, toast } from './helpers/wizard';

const LANE = 5;
const LEASE_ENDING = 'Hợp đồng Căn hộ Thủ Đức hết hạn sau 26 ngày';

test.beforeAll(async ({ request }) => {
  await setClock(request, '2026-10-07T07:05:00+07:00');
});

test.afterAll(async ({ request }) => {
  await setClock(request, null);
});

test('lane 5: Cần xử lý pins the Phòng 5 note above Việc cần làm, loses it each time Mẹ hides it and regains it on Hoàn tác', async ({ page }) => {
  const overdue = { id: seedId(`seed:agent-item:W1-lane-${LANE}`), title: 'Phòng 5 Dãy trọ Dĩ An quá hạn 11 ngày' };
  const leaseEnding = seedId(`seed:agent-item:W3-lane-${LANE}`);
  const waiting = { id: seedId(`e2e:agent-item:old-proposal-lane-${LANE}`), title: 'Gọi khách Phòng 7 Demo hỏi gia hạn hợp đồng' };
  const kept = [overdue.id, leaseEnding, waiting.id].join(',');
  await servicePatch(page, `agent_items?household_id=eq.${laneHousehold(LANE)}&audience=eq.all&status=in.(new,read)&kind=not.in.(brief,weekly)&or=(kind.eq.proposal,severity.eq.action)&id=not.in.(${kept})`, { status: 'dismissed' });
  await servicePatch(page, `agent_items?id=in.(${overdue.id},${leaseEnding})`, { status: 'new' });
  await serviceUpsert(page, 'agent_items', {
    id: waiting.id,
    household_id: laneHousehold(LANE),
    kind: 'proposal',
    severity: 'info',
    audience: 'all',
    title: waiting.title,
    body_md: 'Trợ lý đề xuất việc này.',
    proposal: { type: 'create_task', params: { title: waiting.title, due_on: '2026-10-08', property_id: null, lease_id: null } },
    status: 'new',
    dedupe_key: `e2e:old-proposal:lane-${LANE}`,
    created_at: '2026-10-05T08:00:00+07:00',
  });
  await open(page, `me.lane${LANE}@demo.esta.test`, 'light', PHONE);
  await page.goto('/assistant');

  const pinned = page.getByTestId('pinned');
  await expect(pinned.getByRole('heading', { name: /^Cần xử lý/ })).toBeVisible();
  await expect(pinnedRow(page, overdue.title), 'an action note is the most severe, so it comes first').toHaveCount(1);
  await expect(page.getByTestId('pinned-item').first()).toContainText(overdue.title);
  await expect(page.locator('[data-testid="pinned"] ~ [data-testid="tasks"] ~ [data-testid="thread"]'), 'Việc cần làm sits under Cần xử lý, above the thread').toHaveCount(1);
  await expect(page.getByTestId('composer'), 'the thread still opens at its end').toBeInViewport();
  await expect(pinned, 'pinned above the newest messages').toBeInViewport();
  expect(await pinnedArea(page), 'three rows fit in a third of the screen, so it stays open').toMatchObject({ open: true });
  expect((await pinnedArea(page)).share).toBeLessThanOrEqual(1 / 3);
  expect(await seriousAxeViolations(page)).toEqual([]);

  await page.setViewportSize({ width: 844, height: 390 });
  await page.reload();
  await expect(pinned.locator('details'), 'on a phone turned sideways the rows do not fit, so it folds itself').not.toHaveAttribute('open');
  expect((await pinnedArea(page)).share).toBeLessThanOrEqual(1 / 3);
  await expect(pinned.getByTestId('pinned-count')).toHaveText('3 việc');
  await pinned.locator('summary').click();
  expect(await pinnedArea(page), 'opened by a tap, it still takes at most a third').toMatchObject({ open: true });
  expect((await pinnedArea(page)).share).toBeLessThanOrEqual(1 / 3);
  await page.setViewportSize(PHONE);
  await page.reload();

  await expect(page.getByTestId('pinned-item').getByTestId('pinned-title'), 'the action note before the proposal').toHaveText([overdue.title, LEASE_ENDING, waiting.title]);
  const card = proposalCard(page, overdue.title);
  await pinnedRow(page, overdue.title).getByRole('link').click();
  await expect(card).toBeInViewport();

  await pinned.locator('summary').click();
  await expect(pinned.getByTestId('pinned-item').first(), 'the heading folds the list').toBeHidden();
  await expect(pinned.getByTestId('pinned-count')).toBeVisible();
  await pinned.locator('summary').click();
  await expect(pinnedRow(page, overdue.title)).toBeVisible();

  const hide = () => card.getByRole('button', { name: `Ẩn ghi chú: ${overdue.title}` }).click();
  await hide();
  await expect(pinnedRow(page, overdue.title), 'a hidden note leaves Cần xử lý').toHaveCount(0);
  await toast(page).getByRole('button', { name: 'Hoàn tác' }).click();
  await expect(pinnedRow(page, overdue.title), 'Hoàn tác pins it again').toHaveCount(1);
  await expect(card).toHaveAttribute('data-status', 'new');
  await hide();
  await expect(pinnedRow(page, overdue.title)).toHaveCount(0);
  await expect.poll(async () => (await serviceGet<{ status: string }[]>(page, `agent_items?id=eq.${overdue.id}&select=status`))[0]?.status).toBe('dismissed');
  await page.reload();
  await expect(page.getByTestId('note-settled').filter({ hasText: overdue.title }), 'the thread keeps it as one muted line').toContainText(`Đã ẩn: ${overdue.title}`);
  await expect(pinnedRow(page, overdue.title)).toHaveCount(0);

  await pinnedRow(page, waiting.title).getByRole('link').click();
  const proposal = proposalCard(page, waiting.title);
  await expect(proposal).toBeInViewport();
  const [band, landed] = [await pinned.boundingBox(), await proposal.boundingBox()];
  expect(landed?.y ?? 0, 'an older note lands just below the pinned area, not under it').toBeGreaterThanOrEqual((band?.y ?? 0) + (band?.height ?? 0));
  await proposal.getByRole('button', { name: `Bỏ qua đề xuất: ${waiting.title}` }).click();
  await expect(pinnedRow(page, waiting.title), 'a skipped proposal leaves Cần xử lý').toHaveCount(0);
});
