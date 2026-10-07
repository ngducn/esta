import { expect, test } from '@playwright/test';
import { globSync } from 'node:fs';
import { dirname, join } from 'node:path';

const devRoot = join(import.meta.dirname, '..', '..', 'apps', 'web', 'src', 'app', 'dev');
const devPages = globSync('**/page.tsx', { cwd: devRoot }).map((page) => `/dev/${dirname(page)}`.replace(/\/\.$/, ''));

test('every dev page in the build is covered', () => {
  expect(devPages).toEqual(expect.arrayContaining(['/dev', '/dev/core', '/dev/i18n']));
});

for (const path of devPages) {
  test(`${path} is 404 when a non-production build starts with ESTA_ENV=production`, async ({ request }) => {
    const response = await request.get(path);
    expect(response.status()).toBe(404);
  });
}
