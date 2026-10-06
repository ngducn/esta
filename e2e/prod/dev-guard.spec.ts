import { expect, test } from '@playwright/test';

for (const path of ['/dev', '/dev/anything']) {
  test(`${path} is 404 when a non-production build starts with ESTA_ENV=production`, async ({ request }) => {
    const response = await request.get(path);
    expect(response.status()).toBe(404);
  });
}
