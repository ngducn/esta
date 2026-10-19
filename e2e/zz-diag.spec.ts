import { test } from '@playwright/test';

test('DIAG glyph widths', async ({ page }) => {
  await page.goto('/dev/glyphs');
  await page.evaluate(() => document.fonts.ready);
  const r = await page.evaluate(() => {
    const s = (a: number) => document.querySelector(`[data-amount="${a}"] span`) as HTMLElement;
    const cs = getComputedStyle(s(1111111));
    return {
      w1: s(1111111).getBoundingClientRect().width,
      w8: s(8888888).getBoundingClientRect().width,
      family: cs.fontFamily,
      fvn: cs.fontVariantNumeric,
      ffs: cs.fontFeatureSettings,
      text: s(1111111).textContent,
      faces: [...document.fonts].map((f) => `${f.family}|${f.status}|${f.weight}`),
    };
  });
  process.stdout.write(`DIAG ${JSON.stringify(r)}\n`);
});
