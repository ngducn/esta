/// <reference lib="dom" />
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { oklchToSrgb255 } from '../apps/web/src/design/contrast.ts';
import { colors } from '../apps/web/src/design/tokens.ts';

const GLYPHS = readFileSync(new URL('../fixtures/glyph-test-string.txt', import.meta.url), 'utf8').trim();
const FACES = [{ face: 'sans', variable: '--font-plus-jakarta-sans' }] as const;

/** The rendered sRGB of a CSS color, read back through a canvas so oklch, lab and rgb serializations compare alike. */
function srgbOf(page: Page, cssColor: string): Promise<number[]> {
  return page.evaluate((color) => {
    const context = document.createElement('canvas').getContext('2d');
    if (!context) throw new Error('no 2d canvas');
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);
    return [...context.getImageData(0, 0, 1, 1).data.slice(0, 3)];
  }, cssColor);
}

test('/dev/glyphs renders the glyph string in each self-hosted face with no fallback', async ({ page }) => {
  const response = await page.goto('/dev/glyphs');
  expect(response?.status()).toBe(200);

  for (const { face, variable } of FACES) {
    const shown = page.locator(`[data-face="${face}"]`);
    await expect(shown).not.toHaveCount(0);
    expect(await shown.first().textContent()).toBe(GLYPHS);

    const result = await page.evaluate(
      async ({ variable, text }) => {
        const family = getComputedStyle(document.documentElement).getPropertyValue(variable).split(',')[0]?.trim() ?? '';
        const loaded = await document.fonts.load(`16px ${family}`, text);
        return {
          family,
          loadedFamilies: loaded.map((f) => f.family),
          check: document.fonts.check(`16px ${family}`, text),
        };
      },
      { variable, text: GLYPHS },
    );
    // document.fonts.check is also true for a family no @font-face declares, so the load result proves the face exists.
    expect(result.loadedFamilies, result.family).toContain(result.family.replaceAll('"', ''));
    expect(result.check).toBe(true);
  }

  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
});

test('the figure column sets 1.111.111 ₫ and 8.888.888 ₫ at equal widths', async ({ page }) => {
  await page.goto('/dev/glyphs');
  await page.evaluate(() => document.fonts.ready);
  const width = async (amount: number) =>
    (await page.locator(`[data-testid="figure-column"] [data-amount="${amount}"] span`).boundingBox())?.width ?? NaN;
  const [ones, eights] = [await width(1_111_111), await width(8_888_888)];
  expect(ones).toBeGreaterThan(0);
  expect(Math.abs(ones - eights)).toBeLessThan(0.5);
});

test('esta_theme=dark renders the dark ground from the server and keeps it across navigation', async ({ page, request }) => {
  const html = await (await request.get('/sign-in', { headers: { Cookie: 'esta_theme=dark' } })).text();
  expect(html).toMatch(/<html[^>]*data-theme="dark"/);

  await page.goto('/sign-in');
  await page.context().addCookies([{ name: 'esta_theme', value: 'dark', url: page.url() }]);
  await page.goto('/dev');
  await page.getByRole('link', { name: 'Glyphs and tokens' }).click();
  await expect(page).toHaveURL(/\/dev\/glyphs$/);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const body = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const rendered = await srgbOf(page, body);
  oklchToSrgb255(colors.ground.dark).forEach((channel, i) => expect(Math.abs((rendered[i] ?? NaN) - channel)).toBeLessThanOrEqual(1));
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('a phone set to dark still gets the light theme until the member chooses dark', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/dev/glyphs');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  const rendered = await srgbOf(page, await page.evaluate(() => getComputedStyle(document.body).backgroundColor));
  oklchToSrgb255(colors.ground.light).forEach((channel, i) => expect(Math.abs((rendered[i] ?? NaN) - channel)).toBeLessThanOrEqual(1));
});
