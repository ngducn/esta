import { expect, test } from '@playwright/test';
import { seriousAxeViolations } from './helpers/wizard';

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
      expect(await seriousAxeViolations(page)).toEqual([]);
    });
  }
}

test('the sign-in eyebrow is 12px on 16px leading, the design size', async ({ page }) => {
  await page.goto('/sign-in');
  const eyebrow = page.locator('main p.uppercase').first();
  await expect(eyebrow).toBeVisible();
  const metrics = await eyebrow.evaluate((node) => {
    const style = getComputedStyle(node);
    return { fontSize: style.fontSize, lineHeight: style.lineHeight };
  });
  expect(metrics).toEqual({ fontSize: '12px', lineHeight: '16px' });
});
