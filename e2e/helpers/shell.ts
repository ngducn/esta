import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { signIn } from './inbucket';

/** `en` is the English name on the phone's tab bar, short enough to stay whole at 130% text (FND-8). */
export const sections = [
  { vi: 'Tổng quan', en: 'Home', path: '/' },
  { vi: 'Tài sản', en: 'Assets', path: '/properties' },
  { vi: 'Thu tiền', en: 'Rent', path: '/collections' },
  { vi: 'Tài liệu', en: 'Docs', path: '/documents' },
  { vi: 'Trợ lý', en: 'Assistant', path: '/assistant' },
] as const;

export function onlyOn(project: 'mobile' | 'desktop') {
  test.skip(test.info().project.name !== project, `runs at the ${project} viewport`);
}

export function uniqueEmail(prefix: string): string {
  return `${prefix}.${randomUUID().slice(0, 8)}@demo.esta.test`;
}

export async function newHousehold(page: Page, household = `Gia đình Vỏ Demo ${randomUUID().slice(0, 4)}`): Promise<string> {
  const email = uniqueEmail('shell');
  await signIn(page, email);
  await page.getByLabel('Tên gia đình').fill(household);
  await page.getByLabel('Tên của bạn').fill('Nguyễn Thị Demo');
  await page.getByRole('button', { name: 'Tạo gia đình' }).click();
  await page.getByRole('link', { name: 'Xong' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(household);
  return email;
}

export const tabBar = (page: Page) => page.getByRole('navigation', { name: /^(Các mục chính|Main sections)$/ });

export async function openAccountMenu(page: Page) {
  await page.getByRole('button', { name: /^(Tài khoản|Account)/ }).click();
  await expect(page.locator('#account-menu'), 'the menu has finished sliding in').toHaveCSS('opacity', '1');
}

