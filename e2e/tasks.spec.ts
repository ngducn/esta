import { expect, test, type Page } from '@playwright/test';
import { proposalCard, proposalLane, seedTaskProposal } from './helpers/proposals';
import { laneProperty } from './helpers/seed';
import { open, PHONE, serviceGet, seriousAxeViolations, toast } from './helpers/wizard';

const LANE = 7;
const ME = `me.lane${LANE}@demo.esta.test`;

const task = (page: Page, title: string) => page.getByTestId('task').filter({ has: page.getByTestId('task-title').getByText(title, { exact: true }) });
const onHome = (page: Page, title: string) => page.locator('[data-rule="task_due"]').filter({ has: page.getByTestId('today-title').getByText(title, { exact: true }) });

proposalLane(LANE);

test('Mẹ approves a task due today: it shows under Việc cần làm and on Home, and Xong with undo moves it both ways', async ({ page }) => {
  const today = await seedTaskProposal(page, LANE, { title: 'Gọi người thuê Phòng 5 Demo', dueOn: '2026-10-07', propertyId: laneProperty(LANE, 'di-an') });
  const tomorrow = await seedTaskProposal(page, LANE, { title: 'Hỏi khách Thủ Đức Demo có thuê tiếp', dueOn: '2026-10-08' });
  await open(page, ME, 'light', PHONE);
  await page.goto('/assistant');

  await proposalCard(page, today.title).getByRole('button', { name: `Đồng ý: ${today.title}` }).click();
  await expect(proposalCard(page, today.title).getByTestId('proposal-decision')).toHaveText('Đã đồng ý');
  await expect(task(page, today.title)).toContainText('Hạn 07/10/2026');
  await expect(task(page, today.title)).toContainText('Dãy trọ Dĩ An');
  await proposalCard(page, tomorrow.title).getByRole('button', { name: `Đồng ý: ${tomorrow.title}` }).click();
  await expect(task(page, tomorrow.title)).toBeVisible();
  await expect(page.getByTestId('task').getByTestId('task-title'), 'by due date').toHaveText([today.title, tomorrow.title]);
  expect(await seriousAxeViolations(page)).toEqual([]);

  await page.goto('/');
  await expect(onHome(page, today.title)).toContainText('Đến hạn hôm nay');
  await expect(onHome(page, tomorrow.title), 'a task due tomorrow waits for its day').toHaveCount(0);
  await onHome(page, today.title).getByRole('link', { name: 'Xem việc cần làm' }).click();
  await expect(page).toHaveURL(/\/assistant#tasks$/);
  await expect(page.getByRole('heading', { name: 'Việc cần làm' }), 'Home’s link lands on the list, not at the end of the thread').toBeInViewport();

  await task(page, today.title).getByRole('button', { name: `Xong: ${today.title}` }).click();
  await expect(task(page, today.title)).toHaveCount(0);
  await expect(toast(page)).toContainText('Đã xong một việc.');
  await toast(page).getByRole('button', { name: 'Hoàn tác' }).click();
  await expect(task(page, today.title), 'Hoàn tác opens the task again').toBeVisible();

  await task(page, today.title).getByTestId('task-done').click();
  await expect(task(page, today.title)).toHaveCount(0);
  await expect.poll(async () => (await serviceGet<{ status: string }[]>(page, `tasks?agent_item_id=eq.${today.id}&select=status`))[0]?.status).toBe('done');
  await page.goto('/');
  await expect(onHome(page, today.title), 'a done task leaves Home').toHaveCount(0);
});
