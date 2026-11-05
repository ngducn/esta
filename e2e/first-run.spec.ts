import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { signIn } from './helpers/inbucket';
import { open, PHONE, serviceGet, serviceUpsert, seriousAxeViolations, startWizard, toast } from './helpers/wizard';

const checklist = (page: Page) => page.getByTestId('first-run');
const steps = (page: Page) => page.getByTestId('first-run-step');
const doneSteps = (page: Page) => page.locator('[data-testid="first-run-step"][data-done="true"]');

async function newHousehold(page: Page) {
  const email = `first.${randomUUID().slice(0, 8)}@demo.esta.test`;
  await page.setViewportSize(PHONE);
  await signIn(page, email);
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByLabel('Tên gia đình').fill('Gia đình Demo Mới');
  await page.getByLabel('Tên của bạn').fill('Nguyễn Thị Demo');
  await page.getByRole('button', { name: 'Tạo gia đình' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mời người trong gia đình', { timeout: 20_000 });
  await page.goto('/');
  return email;
}

test('a new household sees three steps, adds a property, hides the guide and undoes it', async ({ page }) => {
  await newHousehold(page);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Gia đình Demo Mới');
  await expect(checklist(page).getByRole('heading', { name: 'Bắt đầu với Esta' })).toBeVisible();
  await expect(steps(page)).toHaveCount(3);
  await expect(doneSteps(page)).toHaveCount(0);
  await expect(page.getByTestId('first-run-action')).toHaveCount(3);
  await expect(page.getByTestId('first-run-action').nth(0)).toHaveAttribute('href', '/properties/new');
  await expect(page.getByTestId('first-run-action').nth(1)).toHaveAttribute('href', '/settings#accounts');
  await expect(page.getByTestId('first-run-action').nth(2)).toHaveAttribute('href', '/settings#members');
  const box = await page.getByRole('heading', { name: /Đã thu tháng/ }).boundingBox();
  expect(box?.y ?? Infinity, 'the stat cards stay on the first phone screen').toBeLessThan(PHONE.height);
  expect(await seriousAxeViolations(page)).toEqual([]);

  await startWizard(page, { nickname: 'Nhà Đầu Tiên Demo', kind: 'townhouse', photo: null });
  await page.goto('/');
  await expect(doneSteps(page)).toHaveCount(1);
  await expect(doneSteps(page).first()).toHaveAttribute('data-step', 'add-property');
  await expect(page.getByTestId('first-run-action')).toHaveCount(2);

  await page.getByTestId('first-run-hide').click();
  await expect(checklist(page)).toHaveCount(0);
  await expect(toast(page).getByText('Đã ẩn hướng dẫn.')).toBeVisible();
  await toast(page).getByRole('button', { name: 'Hoàn tác' }).click();
  await expect(checklist(page)).toBeVisible();
  await expect(doneSteps(page)).toHaveCount(1);

  await page.getByTestId('first-run-hide').click();
  await expect(checklist(page)).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Gia đình Demo Mới');
  await expect(checklist(page)).toHaveCount(0);
  const [settings] = await serviceGet<{ onboarding: { dismissed_at?: string } }[]>(page, 'household_settings?select=onboarding&household_id=in.(' + (await householdIds(page)) + ')');
  expect(settings?.onboarding.dismissed_at).toBeTruthy();
});

async function householdIds(page: Page): Promise<string> {
  const rows = await serviceGet<{ id: string }[]>(page, 'households?name=eq.Gia đình Demo Mới&select=id&order=created_at.desc&limit=1');
  return rows[0]?.id ?? '';
}

test('an invite counts as done the moment it is sent, before it is claimed', async ({ page }) => {
  await newHousehold(page);
  await expect(doneSteps(page)).toHaveCount(0);
  await serviceUpsert(page, 'household_members', {
    household_id: await householdIds(page),
    invited_email: `co.${randomUUID().slice(0, 8)}@demo.esta.test`,
    role: 'member',
  });
  await page.reload();
  await expect(doneSteps(page)).toHaveCount(1);
  await expect(doneSteps(page).first()).toHaveAttribute('data-step', 'invite-member');
});

test('a household that already has its data never sees the guide', async ({ page }) => {
  await open(page, 'me.lane3@demo.esta.test', 'light', PHONE);
  await expect(page.getByRole('heading', { name: /Đã thu tháng/ })).toBeVisible();
  await expect(checklist(page)).toHaveCount(0);
  expect(await seriousAxeViolations(page)).toEqual([]);
});
