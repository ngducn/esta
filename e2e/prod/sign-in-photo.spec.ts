import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1440, height: 900 } });

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
