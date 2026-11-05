import { expect, test } from '@playwright/test';
import { MEMBER } from './routes.ts';
import { signIn } from './helpers/inbucket';
import { onlyOn } from './helpers/shell';
import { noSidewaysScroll } from './helpers/wizard';

const DAILY = [
  { route: '/', tab: 'Tổng quan', failed: 'Chưa tải được Tổng quan' },
  { route: '/properties', tab: 'Tài sản', failed: 'Chưa tải được thông tin tài sản' },
  { route: '/collections', tab: 'Thu tiền', failed: 'Chưa tải được bảng thu tiền' },
  { route: '/documents', tab: 'Tài liệu', failed: 'Chưa tải được tài liệu' },
  { route: '/assistant', tab: 'Trợ lý', failed: 'Chưa tải được' },
] as const;

test.beforeEach(async ({ page }) => {
  onlyOn('mobile');
  await signIn(page, MEMBER);
});

for (const { route, failed } of DAILY) {
  test(`${route} says it could not load, with a retry that works once the network is back`, async ({ page, baseURL }) => {
    await page.context().addCookies([{ name: 'esta_fault', value: 'reads', url: baseURL ?? '' }]);
    await page.goto(route);
    const alert = page.getByRole('alert').filter({ hasText: failed });
    await expect(alert).toBeVisible({ timeout: 30_000 });
    expect(await noSidewaysScroll(page)).toBe(true);
    const retry = alert.getByRole('button', { name: 'Thử lại' });
    expect((await retry.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await page.context().clearCookies({ name: 'esta_fault' });
    await retry.click();
    await expect(alert).toHaveCount(0, { timeout: 30_000 });
  });
}

for (const { route, tab } of DAILY) {
  test(`offline on ${route}, tapping another section stays on the page and says why`, async ({ page }) => {
    await page.goto(route);
    await expect(page.locator('main h1, main h2').first()).toBeVisible({ timeout: 30_000 });
    const other = DAILY.find((entry) => entry.tab !== tab) ?? DAILY[0];
    await page.context().setOffline(true);
    try {
      await page.getByRole('navigation').getByRole('link', { name: other.tab }).click();
      const notice = page.getByTestId('offline-blocked');
      await expect(notice).toContainText('Đang mất mạng');
      expect(new URL(page.url()).pathname).toBe(route);
      expect(await noSidewaysScroll(page)).toBe(true);
    } finally {
      await page.context().setOffline(false);
    }
    await expect(page.getByTestId('offline-blocked')).toHaveCount(0);
    await page.getByRole('navigation').getByRole('link', { name: other.tab }).click();
    await expect(page).toHaveURL((url) => url.pathname === other.route);
  });
}
