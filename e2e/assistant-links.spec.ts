import { expect, test } from '@playwright/test';
import { seedId } from '../supabase/seed/generator/ids.ts';
import { laneProperty } from './helpers/seed';
import { DESKTOP, open } from './helpers/wizard';

const LANE = 4;
const personLink = (key: string) => `/open/party/${seedId(`seed:party:${key}`)}`;

test('a Trợ lý link to a person opens the tenant’s lease or the owner’s tax card, and anyone else answers a real 404 (#321)', async ({ page }) => {
  await open(page, `ryan.lane${LANE}@demo.esta.test`, 'light', DESKTOP);

  await page.goto(personLink(`tenant-lane-${LANE}:di-an:7`));
  await expect(page).toHaveURL(new RegExp(`/properties/${laneProperty(LANE, 'di-an')}/rental/leases/[0-9a-f-]{36}$`));
  await page.goto(personLink(`me-lane-${LANE}`));
  await expect(page).toHaveURL(/\/reports\/tax$/);

  for (const key of [`bank-lane-${LANE}`, `me-lane-${LANE + 1}`, `tenant-lane-${LANE + 1}:di-an:7`]) {
    expect((await page.goto(personLink(key)))?.status(), `${key} has no lease or share this household reads`).toBe(404);
    await expect(page.getByTestId('link-not-found')).toContainText('Không tìm thấy hồ sơ này');
  }
});
