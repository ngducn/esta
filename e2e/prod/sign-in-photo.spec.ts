import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1440, height: 900 } });

test('the sign-in HTML preloads the photo for desktop widths at high priority', async ({ request }) => {
  const html = await (await request.get('/sign-in')).text();
  const preload = html.match(/<link\b[^>]*rel="preload"[^>]*as="image"[^>]*>/i)?.[0] ?? '';
  expect(preload).toContain('media="(min-width: 64rem)"');
  expect(preload).toMatch(/fetchpriority="high"/i);
});

test('the sign-in photo is requested at high priority on a desktop', async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  const priorities: string[] = [];
  cdp.on('Network.requestWillBeSent', ({ request }) => {
    if (request.url.includes('sign-in-hero')) priorities.push(request.initialPriority);
  });
  await page.goto('/sign-in');
  await page.waitForLoadState('load');
  expect(priorities).toEqual(['High']);
});
