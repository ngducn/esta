import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { signIn } from './helpers/inbucket';

const sections = [
  { vi: 'Tổng quan', en: 'Overview', path: '/' },
  { vi: 'Tài sản', en: 'Properties', path: '/properties' },
  { vi: 'Thu tiền', en: 'Collections', path: '/collections' },
  { vi: 'Tài liệu', en: 'Documents', path: '/documents' },
  { vi: 'Trợ lý', en: 'Assistant', path: '/assistant' },
] as const;

function onlyOn(project: 'mobile' | 'desktop') {
  test.skip(test.info().project.name !== project, `runs at the ${project} viewport`);
}

function uniqueEmail(prefix: string): string {
  return `${prefix}.${randomUUID().slice(0, 8)}@demo.esta.test`;
}

async function seriousAxeViolations(page: Page): Promise<string[]> {
  await expect(page).not.toHaveTitle('');
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id} ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

async function setTheme(page: Page, baseURL: string | undefined, theme: 'light' | 'dark') {
  await page.context().addCookies([{ name: 'esta_theme', value: theme, url: baseURL ?? '' }]);
}

async function newHousehold(page: Page, household = `Gia đình Vỏ Demo ${randomUUID().slice(0, 4)}`): Promise<string> {
  const email = uniqueEmail('shell');
  await signIn(page, email);
  await page.getByLabel('Tên gia đình').fill(household);
  await page.getByLabel('Tên của bạn').fill('Nguyễn Thị Demo');
  await page.getByRole('button', { name: 'Tạo gia đình' }).click();
  await page.getByRole('link', { name: 'Xong' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(household);
  return email;
}

const tabBar = (page: Page) => page.getByRole('navigation', { name: /^(Các mục chính|Main sections)$/ });

async function openAccountMenu(page: Page) {
  await page.getByRole('button', { name: /^(Tài khoản|Account)/ }).click();
  await expect(page.locator('#account-menu'), 'the menu has finished sliding in').toHaveCSS('opacity', '1');
}

async function signOutThroughMenu(page: Page) {
  await openAccountMenu(page);
  await page.getByRole('button', { name: /^(Đăng xuất|Sign out)$/ }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
}

async function saveDisplaySettings(page: Page, choices: { textScale?: string; density?: string; theme?: string; language?: string }) {
  await page.goto('/settings');
  for (const choice of Object.values(choices)) await page.getByRole('radio', { name: new RegExp(`^${choice}`) }).check();
  await page.getByRole('button', { name: /^(Lưu|Save)$/ }).click();
  await expect(page.getByRole('status')).toHaveText(/^(Đã lưu cài đặt hiển thị\.|Display settings saved\.)$/);
}

const rootFontSize = (page: Page) => page.locator('html').evaluate((html) => getComputedStyle(html).fontSize);
const pageOverflows = (page: Page) =>
  page.locator('html').evaluate((html) => html.scrollWidth > html.clientWidth);
const overflowingLabels = (page: Page) =>
  tabBar(page)
    .locator('a > span')
    .evaluateAll((labels) => labels.filter((label) => label.scrollWidth > label.clientWidth).map((label) => label.textContent));

test('lane 1: at 390 px the tab bar lists the five sections in order with Tổng quan current', async ({ page }) => {
  onlyOn('mobile');
  await signIn(page, 'me.lane1@demo.esta.test');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Gia đình Demo 1');
  const links = tabBar(page).getByRole('link');
  await expect(links).toHaveText(sections.map((section) => section.vi));
  await expect(links.first()).toHaveAttribute('aria-current', 'page');
  await expect(tabBar(page).locator('[aria-current="page"]')).toHaveCount(1);
  await expect(page.getByTestId('date-line')).toHaveText(/^(Thứ (Hai|Ba|Tư|Năm|Sáu|Bảy)|Chủ Nhật), \d{2}\/\d{2}\/\d{4}$/);
  expect(await seriousAxeViolations(page)).toEqual([]);
});

test('lane 3: tapping each tab opens its section and moves aria-current, in dark', async ({ page, baseURL }) => {
  onlyOn('mobile');
  await setTheme(page, baseURL, 'dark');
  await newHousehold(page);
  for (const section of sections) {
    await tabBar(page).getByRole('link', { name: section.vi }).click();
    await expect(page).toHaveURL(new RegExp(`${section.path === '/' ? '/' : section.path}$`));
    await expect(tabBar(page).locator('[aria-current="page"]')).toHaveText(section.vi);
    await expect(tabBar(page).locator('[aria-current="page"]')).toHaveCount(1);
    if (section.path !== '/') await expect(page.getByRole('heading', { level: 1 })).toHaveText(section.vi);
    await expect(page, 'axe waits for the title of this section, not of the previous page').toHaveTitle(section.path === '/' ? 'Esta' : section.vi);
    expect(await seriousAxeViolations(page), section.path).toEqual([]);
  }
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('lane 2: at 1440 px the sidebar is 240 px, content at most 1200 px, and no tab bar renders', async ({ page }) => {
  onlyOn('desktop');
  await signIn(page, 'ryan.lane2@demo.esta.test');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Gia đình Demo 2');
  const sidebar = page.locator('aside');
  expect((await sidebar.boundingBox())?.width).toBe(240);
  expect((await page.getByRole('main').boundingBox())?.width).toBeLessThanOrEqual(1200);
  await expect(page.getByRole('navigation', { name: 'Các mục chính' })).toHaveCount(1);
  const main = sidebar.getByRole('navigation', { name: 'Các mục chính' });
  await expect(main).toBeVisible();
  await expect(main.getByRole('link')).toHaveText(sections.map((section) => section.vi));
  await expect(sidebar.getByRole('navigation', { name: 'Khác' }).getByRole('link')).toHaveText(['Báo cáo', 'Cài đặt']);
  await expect(sidebar.locator('[aria-current="page"]')).toHaveText('Tổng quan');
  await expect(sidebar.getByRole('button', { name: /^Tài khoản: / }), 'the member block names the member and the role').toContainText('Quản trị');
  expect(await seriousAxeViolations(page)).toEqual([]);
});

test('lane 8: the sidebar works with Tab and Enter alone, with a visible focus ring', async ({ page }) => {
  onlyOn('desktop');
  await newHousehold(page);
  const sidebarLinks = page.locator('aside').getByRole('link');
  await page.locator('body').focus();
  for (const section of sections) {
    await page.keyboard.press('Tab');
    await expect(sidebarLinks.filter({ hasText: section.vi })).toBeFocused();
    const outline = await page.evaluate(() => {
      const focused = document.activeElement;
      return focused === null ? 'none' : getComputedStyle(focused).outlineStyle;
    });
    expect(outline, `${section.vi} shows a focus ring`).not.toBe('none');
    if (section.path === '/documents') break;
  }
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/documents$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tài liệu');
});

test('lane 4: the account menu lists reports, settings, language and sign-out, and Báo cáo opens /reports', async ({ page }) => {
  onlyOn('mobile');
  await newHousehold(page);
  await openAccountMenu(page);
  const menu = page.locator('#account-menu');
  for (const name of ['Báo cáo', 'Cài đặt']) await expect(menu.getByRole('link', { name })).toBeVisible();
  for (const name of ['English', 'Đăng xuất']) await expect(menu.getByRole('button', { name })).toBeVisible();
  expect(await seriousAxeViolations(page)).toEqual([]);
  await menu.getByRole('link', { name: 'Báo cáo' }).click();
  await expect(page).toHaveURL(/\/reports$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Báo cáo');
  await expect(menu, 'the menu closes once its link has opened the page').toBeHidden();

  await openAccountMenu(page);
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
});

test('lane 5: 130% grows text on every section without overflow and survives sign-out', async ({ page }) => {
  onlyOn('mobile');
  const email = await newHousehold(page, `Gia đình Nguyễn Thị Thanh Hương Ở Phường Dĩ An Demo ${randomUUID().slice(0, 4)}`);
  expect(await rootFontSize(page)).toBe('16px');
  await saveDisplaySettings(page, { textScale: '130%' });
  expect(await rootFontSize(page)).toBe('20.8px');
  for (const section of sections) {
    await tabBar(page).getByRole('link', { name: section.vi }).click();
    await expect(page).toHaveURL(new RegExp(`${section.path === '/' ? '/' : section.path}$`));
    expect(await rootFontSize(page)).toBe('20.8px');
    expect(await pageOverflows(page), `${section.path} scrolls sideways`).toBe(false);
    expect(await overflowingLabels(page), section.path).toEqual([]);
  }
  await openAccountMenu(page);
  expect(await pageOverflows(page)).toBe(false);
  await page.keyboard.press('Escape');

  await signOutThroughMenu(page);
  expect(await rootFontSize(page), 'signed out pages use the default scale').toBe('16px');
  await signIn(page, email);
  expect(await rootFontSize(page)).toBe('20.8px');
  await page.goto('/settings');
  await expect(page.getByRole('radio', { name: /^130%/ })).toBeChecked();
});

test('lane 6 and #28: compact density tightens spacing and keeps every text at 15 px or more', async ({ page, baseURL }) => {
  onlyOn('desktop');
  await setTheme(page, baseURL, 'dark');
  await newHousehold(page);
  const mainPadding = () => page.getByRole('main').evaluate((main) => getComputedStyle(main).paddingLeft);
  expect(await mainPadding()).toBe('32px');
  await saveDisplaySettings(page, { density: 'Gọn' });
  await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
  expect(await mainPadding()).toBe('24px');
  const smallText = await page.evaluate(() =>
    [...document.querySelectorAll('body *')]
      .filter((element) => [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()))
      .filter((element) => element.getClientRects().length > 0)
      .filter((element) => Number.parseFloat(getComputedStyle(element).fontSize) < 15)
      .map((element) => element.textContent),
  );
  expect(smallText).toEqual([]);
  expect(await seriousAxeViolations(page)).toEqual([]);
});

test('lane 7: a dark theme chosen on /settings comes back in the server HTML after sign-in', async ({ page }) => {
  onlyOn('desktop');
  const email = await newHousehold(page);
  await saveDisplaySettings(page, { theme: 'Tối' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await signOutThroughMenu(page);
  await signIn(page, email);
  const html = await (await page.request.get('/')).text();
  expect(html).toMatch(/<html[^>]* data-theme="dark"/);
});

async function inviteViewer(page: Page, browser: Browser) {
  await newHousehold(page);
  const viewer = uniqueEmail('viewer');
  await page.goto('/onboarding');
  await page.getByLabel('Email người được mời').fill(viewer);
  await page.getByLabel(/^Chỉ xem/).check();
  await page.getByRole('button', { name: 'Mời', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText(`Đã mời ${viewer} với quyền Chỉ xem.`);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const viewerPage = await context.newPage();
  await signIn(viewerPage, viewer);
  return { context, viewerPage };
}

test('lane 9: a viewer switches its own language to English and the admin keeps Vietnamese', async ({ page, browser, baseURL }) => {
  onlyOn('mobile');
  const { context, viewerPage } = await inviteViewer(page, browser);
  await setTheme(viewerPage, baseURL, 'dark');
  await saveDisplaySettings(viewerPage, { language: 'English' });
  await expect(viewerPage.locator('html')).toHaveAttribute('lang', 'en');
  await expect(tabBar(viewerPage).getByRole('link')).toHaveText(sections.map((section) => section.en));
  await context.close();

  await page.context().clearCookies({ name: 'NEXT_LOCALE' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
  await expect(tabBar(page).getByRole('link')).toHaveText(sections.map((section) => section.vi));
});

test('lane 10: English, 130% and dark on Collections keep every tab label inside its box', async ({ page }) => {
  onlyOn('mobile');
  await newHousehold(page);
  await saveDisplaySettings(page, { language: 'English', textScale: '130%', theme: 'Tối' });
  await tabBar(page).getByRole('link', { name: 'Collections' }).click();
  await expect(page).toHaveURL(/\/collections$/);
  await expect(tabBar(page).getByRole('link')).toHaveText(sections.map((section) => section.en));
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await rootFontSize(page)).toBe('20.8px');
  expect(await overflowingLabels(page)).toEqual([]);
  expect(await pageOverflows(page)).toBe(false);
  await expect(page.getByTestId('date-line')).toHaveText(/^(Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day, \d{2}\/\d{2}\/\d{4}$/);
  expect(await seriousAxeViolations(page)).toEqual([]);
});
