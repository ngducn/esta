import { test } from '@playwright/test';
import { everyLane, setClock } from './helpers/test-clock';

test('the lane households go back to the real date after the dated specs', async ({ request }) => {
  await setClock(request, everyLane, null);
});
