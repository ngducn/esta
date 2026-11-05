import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { memberCall, memberRest } from './helpers/auth-api';
import { signIn } from './helpers/inbucket';
import { DESKTOP, noSidewaysScroll, open, openNewHousehold, PHONE, seriousAxeViolations } from './helpers/wizard';

const LAST_ADMIN = 'Hộ gia đình cần ít nhất một quản trị viên.';

test.beforeEach(() => {
  test.skip(test.info().project.name !== 'mobile', 'each rule makes its own household, so one viewport');
});

const rowOf = (page: Page, text: string | RegExp) => page.getByTestId('member-row').filter({ hasText: text });
const roles = (page: Page) => memberRest<{ invited_email: string; role: string }[]>(page, 'GET', 'household_members?select=invited_email,role&order=created_at');

async function invite(page: Page, email: string) {
  await page.getByTestId('invite-member').click();
  const sheet = page.getByTestId('invite-sheet');
  await expect(sheet.getByRole('heading', { name: 'Mời người thân' })).toBeVisible();
  await sheet.getByTestId('invite-email').fill(email);
  return sheet;
}

test('Ryan invites a relative as a viewer, who signs in and finds nothing to change (PLT-1)', async ({ page, browser }) => {
  await openNewHousehold(page, 'light', PHONE);
  await page.goto('/settings');
  await expect(page.getByTestId('settings-members').getByTestId('member-row')).toHaveCount(1);
  await expect(page.getByTestId('settings-household')).toBeVisible();

  const email = `co.${randomUUID().slice(0, 8)}@demo.esta.test`;
  const sheet = await invite(page, email);
  await page.screenshot({ path: test.info().outputPath('invite-sheet-390.png') });
  expect(await seriousAxeViolations(page)).toEqual([]);
  await sheet.getByTestId('invite-save').click();
  await expect(sheet).toBeHidden();
  await expect(rowOf(page, email).getByTestId('member-pending')).toHaveText('Chưa đăng nhập');
  await expect(rowOf(page, email).getByTestId('member-role')).toHaveValue('viewer');
  expect((await roles(page)).find((row) => row.invited_email === email)?.role, 'the invite reaches only the viewer role').toBe('viewer');
  await page.screenshot({ path: test.info().outputPath('members-390.png'), fullPage: true });

  const again = await invite(page, email);
  await again.getByTestId('invite-save').click();
  await expect(again).toBeHidden();
  expect((await roles(page)).filter((row) => row.invited_email === email)).toHaveLength(1);

  const baseURL = test.info().project.use.baseURL;
  const guest = await browser.newContext({ ...(baseURL === undefined ? {} : { baseURL }), viewport: PHONE });
  const viewer = await guest.newPage();
  await signIn(viewer, email);
  await viewer.goto('/settings');
  await expect(viewer.getByTestId('settings-members')).toBeVisible();
  for (const hidden of ['invite-member', 'member-role', 'remove-member', 'household-name', 'add-account']) await expect(viewer.getByTestId(hidden), hidden).toHaveCount(0);
  await expect(viewer.getByTestId('member-role-text').first()).toBeVisible();
  expect(await noSidewaysScroll(viewer)).toBe(true);
  expect(await seriousAxeViolations(viewer)).toEqual([]);

  const own = (await memberRest<{ id: string }[]>(viewer, 'GET', `household_members?select=id&invited_email=eq.${email}`))[0]?.id;
  const household = (await memberRest<{ id: string }[]>(viewer, 'GET', 'households?select=id'))[0]?.id;
  for (const attempt of [
    await memberCall(viewer, 'PATCH', `household_members?id=eq.${own}`, { role: 'admin' }),
    await memberCall(viewer, 'PATCH', `households?id=eq.${household}`, { name: 'Đổi tên' }),
    await memberCall(viewer, 'POST', 'rpc/invite_member', { p_household_id: household, p_email: 'x@demo.esta.test', p_role: 'viewer' }),
  ]) {
    const body = await attempt.text();
    expect(attempt.ok() ? JSON.parse(body) : attempt.status(), 'the server refuses what the page hides').toEqual(attempt.ok() ? [] : 403);
  }
  expect((await roles(page)).find((row) => row.invited_email === email)?.role).toBe('viewer');
  await guest.close();
});

test('the last admin cannot demote itself, and removing someone asks first and names them', async ({ page }) => {
  await openNewHousehold(page, 'dark', PHONE);
  await page.goto('/settings');
  const me = page.getByTestId('member-row').first();
  await me.getByTestId('member-role').selectOption('member');
  await expect(me.getByTestId('member-error')).toHaveText(LAST_ADMIN);
  expect((await roles(page))[0]?.role).toBe('admin');

  const email = `co.${randomUUID().slice(0, 8)}@demo.esta.test`;
  const sheet = await invite(page, email);
  await sheet.getByTestId('invite-save').click();
  await expect(sheet).toBeHidden();
  await rowOf(page, email).getByTestId('member-role').selectOption('member');
  await expect.poll(async () => (await roles(page)).find((row) => row.invited_email === email)?.role).toBe('member');

  const confirm = page.getByRole('alertdialog', { name: `Xóa ${email} khỏi hộ gia đình?` });
  await rowOf(page, email).getByTestId('remove-member').click();
  await confirm.getByRole('button', { name: 'Giữ lại' }).click();
  await expect(rowOf(page, email)).toHaveCount(1);
  await rowOf(page, email).getByTestId('remove-member').click();
  await confirm.getByRole('button', { name: 'Xóa khỏi hộ gia đình' }).click();
  await expect(rowOf(page, email)).toHaveCount(0);
  expect((await roles(page)).map((row) => row.invited_email)).not.toContain(email);
});

test('an admin renames the household, and the page reads on a desktop in dark', async ({ page }) => {
  await openNewHousehold(page, 'dark', DESKTOP);
  await page.goto('/settings');
  await page.getByTestId('household-name').fill('Gia đình Demo Nguyễn Thị Phương Thảo Hường Bảo Lộc');
  await page.getByTestId('household-save').click();
  await expect.poll(async () => (await memberRest<{ name: string }[]>(page, 'GET', 'households?select=name'))[0]?.name).toBe('Gia đình Demo Nguyễn Thị Phương Thảo Hường Bảo Lộc');
  await expect(page.getByTestId('settings-assistant')).toBeVisible();
  await expect(page.getByTestId('topics-empty')).toBeVisible();
  await expect(page.getByTestId('assistant-runs'), 'the new household has no operator runs yet but its owner is the operator').toBeVisible();
  expect(await seriousAxeViolations(page)).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('settings-1440-dark.png'), fullPage: true });
});

test('an admin who is not the operator sees the assistant status but no runs, and cannot remove the operator', async ({ page }) => {
  await open(page, 'me.lane1@demo.esta.test', 'light', PHONE);
  await page.goto('/settings');
  await expect(page.getByTestId('worker-status')).toBeVisible();
  await expect(page.getByTestId('assistant-runs')).toHaveCount(0);
  await expect(page.getByTestId('topics')).toBeVisible();
  const operator = (await memberRest<{ id: string }[]>(page, 'GET', 'household_members?select=id&is_operator=eq.true'))[0]?.id;
  const refused = await memberCall(page, 'DELETE', `household_members?id=eq.${operator}`);
  expect(refused.status()).toBe(403);
  expect((await roles(page)).length).toBeGreaterThan(1);
});
