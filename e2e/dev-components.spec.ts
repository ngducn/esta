/// <reference lib="dom" />
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const themes = ['light', 'dark'] as const;

async function open(page: Page, theme: (typeof themes)[number]) {
  await page.goto('/dev/components');
  await page.context().addCookies([{ name: 'esta_theme', value: theme, url: page.url() }]);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

for (const theme of themes) {
  test(`/dev/components shows one card per registry state with no serious axe issue, ${theme}`, async ({ page }) => {
    await open(page, theme);
    const size = Number(await page.locator('main').getAttribute('data-registry-size'));
    expect(size).toBeGreaterThan(40);
    await expect(page.locator('[data-state-card]')).toHaveCount(size);

    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
  });

  test(`every enabled control's border reaches 3:1 against its fill and the page, ${theme}`, async ({ page }) => {
    await open(page, theme);
    const { checked, weak } = await page.evaluate(() => {
      const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('no 2d canvas');
      const luminance = (color: string) => {
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        const [r = 0, g = 0, b = 0] = [...context.getImageData(0, 0, 1, 1).data].map((v) => {
          const c = v / 255;
          return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const ratio = (a: string, b: string) => {
        const [x, y] = [luminance(a), luminance(b)];
        return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
      };
      const page = getComputedStyle(document.body).backgroundColor;
      const boxes = [
        ...document.querySelectorAll<HTMLElement>('[data-slot="input"]:not(:disabled)'),
        ...document.querySelectorAll<HTMLElement>('[data-slot="checkbox"]:not([data-disabled]):not([data-checked]):not([data-indeterminate]) > span'),
      ];
      const weak = boxes.flatMap((box) => {
        const style = getComputedStyle(box);
        const worst = Math.min(ratio(style.borderTopColor, style.backgroundColor), ratio(style.borderTopColor, page));
        return worst < 3 ? [`${box.closest('[data-state-card]')?.getAttribute('data-component')}: ${worst.toFixed(2)}`] : [];
      });
      return { checked: boxes.length, weak };
    });
    expect(checked).toBeGreaterThan(5);
    expect(weak).toEqual([]);
  });
}
