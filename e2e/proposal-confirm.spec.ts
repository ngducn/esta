import { expect, test, type Page } from '@playwright/test';
import { memberRest } from './helpers/auth-api';
import { freshLease } from './helpers/leases';
import { proposalCard, proposalLane, seedProposal } from './helpers/proposals';
import { laneLease } from './helpers/seed';
import { DESKTOP, open, PHONE, serviceGet, seriousAxeViolations, vnd } from './helpers/wizard';

const LANE = 7;
const ME = `me.lane${LANE}@demo.esta.test`;
// Fresh leases add rooms with bills to their lane's Thu tiền board, so they go on lane 4, whose board lease-detail
// already adds rooms to, never on lane 7, whose October board collections.spec reads exactly.
const LEASE_LANE = 4;
const LEASE_ME = `me.lane${LEASE_LANE}@demo.esta.test`;

const approve = (page: Page, title: string) => proposalCard(page, title).getByRole('button', { name: `Đồng ý: ${title}` });
const question = (page: Page) => page.getByRole('alertdialog');
const written = async (page: Page, itemId: string) =>
  (
    await Promise.all(
      ['tasks', 'leases', 'lease_amendments'].map((table) => serviceGet<unknown[]>(page, `${table}?agent_item_id=eq.${itemId}&select=id`)),
    )
  ).flat().length;
const issued = (page: Page, leaseId: string) => memberRest<unknown[]>(page, 'GET', `invoices?lease_id=eq.${leaseId}&status=eq.issued&select=id,period_start&order=period_start`);

proposalLane(LANE);

test("a rent change asks in Esta's words, Thôi changes nothing, and Đồng ý adds the amendment without touching an issued bill", async ({ page }) => {
  await open(page, LEASE_ME, 'dark', PHONE);
  const lease = await freshLease(page, LEASE_LANE, { start: '2026-08-01', end: '2027-07-31', rent: 3_000_000, paidThrough: '2026-09-30' });
  const before = await issued(page, lease.id);
  const item = await seedProposal(page, LEASE_LANE, 'suggest_rent_change', { title: 'Tăng tiền thuê phòng Demo', lease_id: lease.id, effective_period_start: '2026-12-01', rent_vnd: 3_200_000 });
  await page.goto('/assistant');

  await approve(page, item.title).click();
  await expect(question(page)).toHaveAccessibleName(`Tăng tiền thuê ${lease.label} lên ${vnd('3.200.000')} từ 01/12/2026?`);
  expect(await seriousAxeViolations(page)).toEqual([]);
  await question(page).getByRole('button', { name: 'Thôi' }).click();
  await expect(question(page)).toHaveCount(0);
  expect(await written(page, item.id), 'Thôi writes nothing').toBe(0);

  await approve(page, item.title).click();
  await question(page).getByRole('button', { name: 'Đồng ý' }).click();
  await expect(proposalCard(page, item.title).getByTestId('proposal-decision')).toHaveAttribute('data-decision', 'approved');
  await proposalCard(page, item.title).getByTestId('proposal-lease').click();
  await expect(page.getByTestId('lease-amendments')).toContainText(`Từ 01/12/2026: ${vnd('3.200.000')} mỗi tháng`);
  expect(await issued(page, lease.id)).toEqual(before);
});

test('a rent change on a lease terminated since the proposal fails and writes no amendment', async ({ page }) => {
  await open(page, LEASE_ME, 'light', DESKTOP);
  const lease = await freshLease(page, LEASE_LANE, { start: '2026-08-01', end: '2027-07-31', rent: 3_000_000, paidThrough: '2026-09-30' });
  const item = await seedProposal(page, LEASE_LANE, 'suggest_rent_change', { title: 'Tăng tiền phòng sắp trả Demo', lease_id: lease.id, effective_period_start: '2026-12-01', rent_vnd: 3_200_000 });
  await memberRest(page, 'POST', 'rpc/terminate_lease', { p_lease_id: lease.id, p_terminated_on: '2026-10-31', p_reason: 'Khách Demo trả phòng' });
  await page.goto('/assistant');
  await approve(page, item.title).click();
  await question(page).getByRole('button', { name: 'Đồng ý' }).click();
  await expect(proposalCard(page, item.title).getByTestId('proposal-decision')).toHaveText('Đề xuất này không còn áp dụng.');
  expect(await written(page, item.id)).toBe(0);
  expect(await seriousAxeViolations(page)).toEqual([]);
});

test('a renewal names the new rent and leaves a draft that links back to the lease it renews', async ({ page }) => {
  await open(page, LEASE_ME, 'light', DESKTOP);
  const lease = await freshLease(page, LEASE_LANE, { start: '2026-01-01', end: '2026-12-31', rent: 3_000_000, paidThrough: '2026-09-30' });
  const item = await seedProposal(page, LEASE_LANE, 'suggest_lease_renewal', { title: 'Gia hạn phòng Demo', lease_id: lease.id, increase_bps: 500, end_date: '2027-12-31' });
  await page.goto('/assistant');
  await approve(page, item.title).click();
  await expect(question(page)).toHaveAccessibleName(`Gia hạn hợp đồng ${lease.label} đến 31/12/2027, tiền thuê ${vnd('3.200.000')} mỗi tháng?`);
  await question(page).getByRole('button', { name: 'Đồng ý' }).click();
  await proposalCard(page, item.title).getByTestId('proposal-lease').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Hợp đồng nháp ${lease.label}`);
  await expect(page.getByTestId('lease-renewal-of')).toHaveAttribute('href', lease.path);
});

test("a reminder opens Esta's own draft for the overdue room and writes nothing", async ({ page }) => {
  await open(page, ME, 'light', PHONE);
  const item = await seedProposal(page, LANE, 'draft_reminder', { title: 'Nhắc phòng quá hạn Demo', lease_id: laneLease(LANE, 'di-an', 5) });
  await page.goto('/assistant');
  await approve(page, item.title).click();
  const sheet = page.getByTestId('reminder-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId('reminder-text')).toContainText(`Tiền thuê Phòng 5, Dãy trọ Dĩ An kỳ 25/09/2026 – 24/10/2026 còn ${vnd('2.800.000')} chưa thanh toán, đã quá hạn 12 ngày`);
  expect(await seriousAxeViolations(page)).toEqual([]);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await sheet.getByTestId('reminder-copy').click();
  await expect(sheet.getByTestId('reminder-copy-status')).toHaveText('Đã sao chép. Mở Zalo rồi dán vào ô tin nhắn.');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await sheet.getByTestId('reminder-text').textContent());
  await sheet.getByRole('button', { name: 'Đóng' }).click();
  await expect(proposalCard(page, item.title).getByRole('button', { name: 'Mở lời nhắc' }), 'the card keeps the reminder for later').toBeVisible();
  expect(await written(page, item.id)).toBe(0);
});
