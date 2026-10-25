import { expect, test, type Page } from '@playwright/test';
import { seedId } from '../supabase/seed/generator/ids.ts';
import { memberCall, memberRest } from './helpers/auth-api';
import { proposalCard, proposalLane, seedTaskProposal } from './helpers/proposals';
import { laneHousehold } from './helpers/seed';
import { DESKTOP, open, PHONE, serviceGet, servicePatch, seriousAxeViolations, toast } from './helpers/wizard';

const LANE = 7;
const ME = `me.lane${LANE}@demo.esta.test`;
const VIEWER = `viewer.lane${LANE}@demo.esta.test`;

const tasksOf = (page: Page, itemId: string) => serviceGet<{ id: string }[]>(page, `tasks?agent_item_id=eq.${itemId}&select=id`);
const statusOf = async (page: Page, itemId: string) => (await serviceGet<{ status: string }[]>(page, `agent_items?id=eq.${itemId}&select=status`))[0]?.status;

proposalLane(LANE);

test('Bỏ qua sets a proposal aside with undo and writes nothing but the item', async ({ page }) => {
  const item = await seedTaskProposal(page, LANE, { title: 'Kiểm tra số đo điện Demo', dueOn: '2026-10-07' });
  await open(page, ME, 'light', PHONE);
  await page.goto('/assistant');
  await proposalCard(page, item.title).getByRole('button', { name: `Bỏ qua đề xuất: ${item.title}` }).click();
  await expect(proposalCard(page, item.title)).toHaveCount(0);
  await expect(toast(page)).toContainText('Đã bỏ qua đề xuất.');
  await toast(page).getByRole('button', { name: 'Hoàn tác' }).click();
  await expect(proposalCard(page, item.title).getByTestId('proposal-approve'), 'Hoàn tác brings the buttons back').toBeVisible();
  await proposalCard(page, item.title).getByTestId('proposal-skip').click();
  await expect.poll(() => statusOf(page, item.id)).toBe('dismissed');
  expect(await tasksOf(page, item.id)).toEqual([]);
  const audit = await serviceGet<{ table_name: string; actor_kind: string }[]>(page, `audit_log?row_id=eq.${item.id}&action=eq.update&select=table_name,actor_kind`);
  expect(audit.map((row) => [row.table_name, row.actor_kind])).toEqual([
    ['agent_items', 'user'],
    ['agent_items', 'user'],
    ['agent_items', 'user'],
  ]);
});

test('two devices approving at once make one task, and a stale tab reads Đã đồng ý', async ({ page }) => {
  const item = await seedTaskProposal(page, LANE, { title: 'Gọi thợ sửa mái Demo', dueOn: '2026-10-09' });
  await open(page, ME, 'dark', PHONE);
  await page.goto('/assistant');
  await expect(proposalCard(page, item.title).getByTestId('proposal-approve')).toBeVisible();

  const approve = () => memberRest<string>(page, 'POST', 'rpc/approve_proposal', { p_item_id: item.id });
  expect(await Promise.all([approve(), approve(), approve()])).toEqual(['approved', 'approved', 'approved']);
  expect(await tasksOf(page, item.id)).toHaveLength(1);

  await proposalCard(page, item.title).getByRole('button', { name: `Đồng ý: ${item.title}` }).click();
  await expect(proposalCard(page, item.title).getByTestId('proposal-decision')).toHaveText('Đã đồng ý');
  expect(await tasksOf(page, item.id), 'the stale tab added nothing').toHaveLength(1);
  const [task] = await tasksOf(page, item.id);
  const actors = await serviceGet<{ table_name: string; actor_kind: string; actor_id: string }[]>(
    page,
    `audit_log?or=(and(table_name.eq.tasks,row_id.eq.${task?.id}),and(table_name.eq.agent_items,row_id.eq.${item.id}))&select=table_name,actor_kind,actor_id&order=id`,
  );
  const me = seedId(`seed:user:me-lane-${LANE}`);
  expect(actors.filter((row) => row.actor_kind === 'user'), 'Mẹ is the actor of the task and of the decision').toEqual([
    { table_name: 'tasks', actor_kind: 'user', actor_id: me },
    { table_name: 'agent_items', actor_kind: 'user', actor_id: me },
  ]);
});

test('params the registry no longer reads make the proposal fail and create no task', async ({ page }) => {
  const item = await seedTaskProposal(page, LANE, { title: 'Việc với tham số cũ Demo', dueOn: '2026-10-07' });
  await servicePatch(page, `agent_items?id=eq.${item.id}`, { proposal: { type: 'create_task', params: { title: item.title, due_on: 'tuần sau' } } });
  await open(page, ME, 'light', DESKTOP);
  await page.goto('/assistant');
  await proposalCard(page, item.title).getByRole('button', { name: `Đồng ý: ${item.title}` }).click();
  await expect(proposalCard(page, item.title).getByTestId('proposal-decision')).toHaveText('Đề xuất này không còn áp dụng.');
  expect(await statusOf(page, item.id)).toBe('failed');
  expect(await tasksOf(page, item.id)).toEqual([]);
  await page.reload();
  await expect(proposalCard(page, item.title).getByTestId('proposal-decision'), 'the card still says so after a reload').toHaveAttribute('data-decision', 'failed');
  expect(await seriousAxeViolations(page)).toEqual([]);
});

test('a viewer reads a proposal without buttons and cannot approve it with a crafted call', async ({ page }) => {
  const item = await seedTaskProposal(page, LANE, { title: 'Đề xuất cho người xem Demo', dueOn: null });
  await open(page, ME, 'light', PHONE);
  const existing = await memberRest<unknown[]>(page, 'GET', `household_members?invited_email=eq.${VIEWER}&select=id`);
  if (existing.length === 0) await memberRest(page, 'POST', 'household_members', { household_id: laneHousehold(LANE), invited_email: VIEWER, role: 'viewer' });
  await page.context().clearCookies();
  await open(page, VIEWER, 'light', PHONE);
  await page.goto('/assistant');
  await expect(proposalCard(page, item.title)).toBeVisible();
  await expect(proposalCard(page, item.title).getByRole('button')).toHaveCount(0);
  const crafted = await memberCall(page, 'POST', 'rpc/approve_proposal', { p_item_id: item.id });
  expect(crafted.ok()).toBe(false);
  expect(await statusOf(page, item.id)).toBe('new');
  expect(await tasksOf(page, item.id)).toEqual([]);
});
