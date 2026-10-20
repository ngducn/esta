import { expect, test } from '@playwright/test';
import { initialJs, INITIAL_JS_BUDGET_BYTES } from '../helpers/bundle';

test('/ ships no next-intl client runtime and stays under the initial JS budget', async ({ request }) => {
  const { sources, gzippedBytes, withIntlRuntime } = await initialJs(request, '/');
  expect(sources.length).toBeGreaterThan(0);
  expect(withIntlRuntime).toEqual([]);
  expect(gzippedBytes).toBeLessThan(INITIAL_JS_BUDGET_BYTES);
});
