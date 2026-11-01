import { expect, test } from '@playwright/test';
import { signIn } from './helpers/inbucket';
import { newHousehold, onlyOn, openAccountMenu, sections, tabBar } from './helpers/shell';
import { noSidewaysScroll, seriousAxeViolations } from './helpers/wizard';

test('lane 4: the account menu lists the four display settings, reports, settings and sign-out, and Báo cáo opens /reports', async ({ page }) => {
  onlyOn('mobile');
  await newHousehold(page);
  await openAccountMenu(page);
  const menu = page.locator('#account-menu');
  for (const name of ['Báo cáo', 'Cài đặt']) await expect(menu.getByRole('link', { name })).toBeVisible();
  for (const name of ['Cỡ chữ', 'Giao diện', 'Mật độ', 'Ngôn ngữ']) await expect(menu.getByRole('radiogroup', { name })).toBeVisible();
  await expect(menu.getByRole('button', { name: 'Đóng' }), 'a phone sheet closes with a word').toBeVisible();
  await expect(menu.getByRole('button', { name: 'Đăng xuất' })).toBeVisible();
  expect(await seriousAxeViolations(page)).toEqual([]);
  await menu.getByRole('link', { name: 'Báo cáo' }).click();
  await expect(page).toHaveURL(/\/reports$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Báo cáo');
  await expect(menu, 'the menu closes once its link has opened the page').toBeHidden();

  await openAccountMenu(page);
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
});


test('lane 12: a setting tapped in the account menu applies at once and the menu stays open', async ({ page }) => {
  await newHousehold(page);
  await openAccountMenu(page);
  const menu = page.locator('#account-menu');
  await menu.getByRole('radio', { name: '130%' }).check();
  await expect(page.locator('html')).toHaveAttribute('data-text-scale', '130');
  await menu.getByRole('radio', { name: 'Gọn' }).check();
  await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
  await menu.getByRole('radio', { name: 'Tối' }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await menu.getByRole('radio', { name: 'English' }).check();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(menu, 'the menu stays open over the page it just changed').toBeVisible();
  await expect(menu.getByRole('radiogroup', { name: 'Language' })).toBeVisible();
  await expect(menu.getByRole('radio', { name: '130%' }), 'every choice was saved, not only the last').toBeChecked();
  await menu.getByRole('radio', { name: 'Tiếng Việt' }).check();
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-text-scale', '130');
  await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
});


test('lane 15: the account menu works from the keyboard and Escape returns focus to its trigger', async ({ page }) => {
  await newHousehold(page);
  const trigger = page.getByRole('button', { name: /^(Tài khoản|Account)/ }).and(page.locator(':visible'));
  await trigger.click();
  const menu = page.locator('#account-menu');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('radio', { name: '100%' }), 'focus starts on the first setting').toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('radio', { name: 'Sáng' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(menu.getByRole('radio', { name: 'Tối' })).toBeFocused();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('link', { name: 'Báo cáo' })).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(menu.getByRole('radio', { name: 'Tiếng Việt' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
});


test('lane 16: from 840 px the sidebar is an icon rail with names for its links, and under 840 px the tab bar returns', async ({ page }) => {
  onlyOn('desktop');
  await signIn(page, 'ryan.lane2@demo.esta.test');
  await page.setViewportSize({ width: 960, height: 800 });
  const sidebar = page.locator('aside');
  expect((await sidebar.boundingBox())?.width).toBe(72);
  await expect(tabBar(page), 'no tab bar beside the rail').toHaveCount(1);
  await expect(tabBar(page).getByRole('link', { name: 'Tổng quan' })).toHaveAttribute('aria-current', 'page');
  for (const section of sections) await expect(sidebar.getByRole('link', { name: section.vi })).toBeVisible();
  const second = sidebar.getByRole('link', { name: 'Tài sản' });
  await second.hover();
  const tip = await second.evaluate((link) => getComputedStyle(link, '::after').display);
  expect(tip, 'hovering a rail icon shows its name').toBe('block');
  expect(await noSidewaysScroll(page)).toBe(true);
  expect(await seriousAxeViolations(page)).toEqual([]);
  await page.setViewportSize({ width: 839, height: 800 });
  await expect(sidebar).toBeHidden();
  await expect(tabBar(page).getByRole('link')).toHaveCount(5);
});
