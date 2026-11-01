import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const PAGES = ['/sign-in', '/sign-in/code', '/sign-up', '/forgot-password'] as const;

for (const theme of ['light', 'dark'] as const) {
  for (const path of PAGES) {
    test(`${path} in ${theme} has no serious axe violation and sets its headline in Inter Display`, async ({ page, context, baseURL }) => {
      await context.addCookies([{ name: 'esta_theme', value: theme, url: baseURL ?? 'http://localhost' }]);
      await page.goto(path);
      await expect(page).not.toHaveTitle('');
      const headline = page.getByRole('heading', { level: 1 });
      await expect(headline).toBeVisible();
      const face = await headline.evaluate(async (node) => {
        await document.fonts.ready;
        const style = getComputedStyle(node);
        const family = style.fontFamily.split(',')[0]?.trim() ?? '';
        const loaded = [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family);
        return { family, weight: style.fontWeight, loaded };
      });
      expect(face.weight).toBe('300');
      expect(face.family).toMatch(/interDisplay/i);
      expect(face.loaded, 'the headline face is downloaded, not a fallback').toContain(face.family.replaceAll('"', ''));
      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
    });
  }
}
