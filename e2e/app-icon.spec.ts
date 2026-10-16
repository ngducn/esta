import { expect, test } from '@playwright/test';

test('a signed-out phone can read the manifest and every icon it names, for the home-screen install', async ({ request }) => {
  const response = await request.get('/manifest.webmanifest', { maxRedirects: 0 });
  expect(response.status()).toBe(200);
  const manifest = (await response.json()) as { display: string; icons: { src: string; sizes: string; purpose: string }[] };
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.map((icon) => `${icon.sizes} ${icon.purpose}`)).toEqual(['192x192 any', '512x512 any', '512x512 maskable']);
  for (const icon of manifest.icons) {
    const file = await request.get(icon.src, { maxRedirects: 0 });
    expect(file.status(), icon.src).toBe(200);
    expect(file.headers()['content-type'], icon.src).toBe('image/png');
  }

  const html = await (await request.get('/sign-in')).text();
  expect(html).toMatch(/<link rel="icon" href="\/icon\.svg[^"]*"[^>]*type="image\/svg\+xml"/);
  expect(html).toMatch(/<link rel="apple-touch-icon" href="\/apple-icon\.png[^"]*" sizes="180x180"/);
});
