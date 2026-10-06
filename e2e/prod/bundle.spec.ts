import { gzipSync } from 'node:zlib';
import { expect, test } from '@playwright/test';

const INITIAL_JS_BUDGET_BYTES = 200_000;

test('/ ships no next-intl client runtime and stays under the initial JS budget', async ({ request }) => {
  const html = await (await request.get('/')).text();
  const sources = new Set(html.match(/(?<=<script src=")[^"]+/g));
  expect(sources.size).toBeGreaterThan(0);
  const withIntlRuntime: string[] = [];
  let gzippedBytes = 0;
  for (const source of sources) {
    const body = await (await request.get(source)).body();
    if (body.includes('IntlMessageFormat')) withIntlRuntime.push(source);
    gzippedBytes += gzipSync(body, { level: 9 }).length;
  }
  expect(withIntlRuntime).toEqual([]);
  expect(gzippedBytes).toBeLessThan(INITIAL_JS_BUDGET_BYTES);
});
