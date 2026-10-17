import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';
import { parseSlot } from '../scripts/slot.ts';
import { slotEnv } from '../scripts/slot-env.ts';
import { seedId } from '../supabase/seed/generator/ids.ts';
import { signIn } from './helpers/inbucket';
import { accessToken } from './helpers/session';

const repoRoot = join(import.meta.dirname, '..');
const env = slotEnv(repoRoot, parseSlot(process.env.ESTA_SLOT));
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };
const propertyId = (lane: number, key: string) => seedId(`seed:property:lane-${lane}:${key}`);
const legalPath = (lane: number, key: string) => `/properties/${propertyId(lane, key)}/legal`;
const party = (person: 'me' | 'ryan', lane: number) => seedId(`seed:party:${person}-lane-${lane}`);

// Each rule writes to its own lane household, so the spec runs at one project's viewport and sets the rule's own.
test.beforeEach(() => test.skip(test.info().project.name !== 'mobile', 'each rule sets its own viewport'));

async function open(page: Page, email: string, theme: 'light' | 'dark', viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  await page.context().addCookies([{ name: 'esta_theme', value: theme, url: test.info().project.use.baseURL ?? '' }]);
  await signIn(page, email);
}

async function rest(page: Page, method: 'POST' | 'PATCH' | 'DELETE', path: string, data?: unknown) {
  const response = await page.request.fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method,
    headers: { apikey: anonKey, authorization: `Bearer ${await accessToken(page)}`, 'content-type': 'application/json' },
    ...(data === undefined ? {} : { data }),
  });
  expect(response.ok(), await response.text()).toBe(true);
}

/** Puts a lane property back to its SPEC §9.3 50/50 split, so a rule passes again without a reset. */
async function resetFiftyFifty(page: Page, lane: number, key: 'thu-duc' | 'bien-hoa', since: string) {
  const share = (person: 'me' | 'ryan') => ({ party_id: party(person, lane), share_bp: 5000, named_on_certificate: true, since });
  await rest(page, 'POST', 'rpc/set_ownership_shares', { p_property_id: propertyId(lane, key), p_shares: [share('me'), share('ryan')] });
}

async function seriousAxeViolations(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id} ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

const owners = (page: Page) => page.getByTestId('owners');
const ownerRow = (page: Page, name: string) => owners(page).getByTestId('owner-row').filter({ hasText: name });
const draft = (page: Page, name: string) => page.getByTestId('owner-draft').filter({ hasText: name });

async function setShare(page: Page, name: string, percent: string) {
  await draft(page, name).getByTestId('owner-share').fill(percent);
}

async function saveSheet(page: Page) {
  await page.getByTestId('save-ownership').click();
  await expect(page.getByTestId('ownership-sheet')).toHaveCount(0);
}

test('rule 1: Mẹ saves 60% and 30% on Căn hộ Thủ Đức and the under-100% warning survives a reload', async ({ page }) => {
  await open(page, 'me.lane1@demo.esta.test', 'light', PHONE);
  await resetFiftyFifty(page, 1, 'thu-duc', '2019-11-20');
  await page.goto(legalPath(1, 'thu-duc'));
  await expect(ownerRow(page, 'Nguyễn Thị Demo').getByTestId('owner-share-value')).toHaveText('50%');
  await expect(ownerRow(page, 'Trần Minh Demo').getByTestId('owner-share-value')).toHaveText('50%');
  await expect(owners(page).getByTestId('owner-named-mark')).toHaveText(['Có tên trên sổ', 'Có tên trên sổ']);
  await expect(page.getByTestId('ownership-warning')).toHaveCount(0);
  expect(await seriousAxeViolations(page)).toEqual([]);

  await page.getByTestId('edit-owners').click();
  await setShare(page, 'Nguyễn Thị Demo', '60');
  await setShare(page, 'Trần Minh Demo', '30');
  await expect(page.getByTestId('ownership-running-total')).toContainText('Cộng lại 90%');
  expect(await seriousAxeViolations(page)).toEqual([]);
  await saveSheet(page);
  await expect(page.getByTestId('ownership-warning')).toHaveText('Tỷ lệ sở hữu cộng lại 90%, chưa đủ 100%.');

  await page.reload();
  await expect(page.getByTestId('ownership-warning')).toHaveText('Tỷ lệ sở hữu cộng lại 90%, chưa đủ 100%.');
  await expect(ownerRow(page, 'Nguyễn Thị Demo').getByTestId('owner-share-value')).toHaveText('60%');
  await expect(ownerRow(page, 'Trần Minh Demo').getByTestId('owner-share-value')).toHaveText('30%');
});

test('rule 2: Ryan filters Tài sản by owner Trần Minh Demo and the filter survives a reload', async ({ page }) => {
  await open(page, 'ryan.lane2@demo.esta.test', 'dark', DESKTOP);
  await page.goto('/properties');
  const ownerChips = page.locator('[data-filter="owner"]');
  await expect(ownerChips).toHaveText(['Tất cả7', 'Trần Minh Demo3', 'Nguyễn Thị Demo6']);
  await ownerChips.filter({ hasText: 'Trần Minh Demo' }).click();
  await expect(page).toHaveURL(new RegExp(`owner=${party('ryan', 2)}`));

  await page.reload();
  await expect(page).toHaveURL(new RegExp(`owner=${party('ryan', 2)}`));
  const cards = page.getByTestId('property-card');
  await expect(cards).toHaveCount(3);
  for (const nickname of ['Căn hộ Thủ Đức', 'Kho Biên Hòa', 'Đất vườn Long An']) await expect(cards.filter({ hasText: nickname })).toHaveCount(1);
  expect(await seriousAxeViolations(page)).toEqual([]);
});

test('rule 3: Mẹ quick-adds Lê Văn Demo on Kho Biên Hòa and splits it 33,33, 33,33 and 33,34 with no warning', async ({ page }) => {
  await open(page, 'me.lane3@demo.esta.test', 'dark', PHONE);
  await resetFiftyFifty(page, 3, 'bien-hoa', '2003-06-30');
  await rest(page, 'DELETE', `parties?household_id=eq.${seedId('seed:household:lane-3')}&full_name=eq.${encodeURIComponent('Lê Văn Demo')}`);
  await page.goto(legalPath(3, 'bien-hoa'));
  await page.getByTestId('edit-owners').click();
  await page.getByTestId('add-holder').click();
  await page.getByTestId('quick-add-name').fill('Lê Văn Demo');
  await page.getByTestId('quick-add-save').click();
  await expect(draft(page, 'Lê Văn Demo')).toHaveCount(1);
  await setShare(page, 'Nguyễn Thị Demo', '33,33');
  await setShare(page, 'Trần Minh Demo', '33,33');
  await setShare(page, 'Lê Văn Demo', '33,34');
  await expect(page.getByTestId('ownership-running-total')).toHaveText('Cộng lại 100%');
  await saveSheet(page);

  await page.reload();
  await expect(owners(page).getByTestId('owner-share-value')).toHaveText(['33,34%', '33,33%', '33,33%']);
  await expect(ownerRow(page, 'Lê Văn Demo').getByTestId('owner-share-value')).toHaveText('33,34%');
  await expect(page.getByTestId('ownership-warning')).toHaveCount(0);
  await expect(page.getByTestId('ownership-total')).toHaveText('Tổng cộng 100%');
});

test('rule 4: Ryan unmarks Trần Minh Demo as named and saves 70% and 40%, and the over-100% warning shows', async ({ page }) => {
  await open(page, 'ryan.lane4@demo.esta.test', 'light', DESKTOP);
  await resetFiftyFifty(page, 4, 'thu-duc', '2019-11-20');
  await page.goto(legalPath(4, 'thu-duc'));
  await page.getByTestId('edit-owners').click();
  await draft(page, 'Trần Minh Demo').getByTestId('owner-named').click();
  await expect(draft(page, 'Trần Minh Demo').getByTestId('owner-named')).toHaveAttribute('aria-checked', 'false');
  await setShare(page, 'Nguyễn Thị Demo', '70');
  await setShare(page, 'Trần Minh Demo', '40');
  await saveSheet(page);

  await page.reload();
  await expect(ownerRow(page, 'Trần Minh Demo').getByTestId('owner-named-mark')).toHaveCount(0);
  await expect(ownerRow(page, 'Nguyễn Thị Demo').getByTestId('owner-named-mark')).toHaveCount(1);
  await expect(page.getByTestId('ownership-warning')).toHaveText('Tỷ lệ sở hữu cộng lại 110%, vượt quá 100%.');
  expect(await seriousAxeViolations(page)).toEqual([]);
});

test('rule 5: in English at 130% and dark, rule 1 warns in English and the rows wrap without sideways scroll', async ({ page }) => {
  await open(page, 'me.lane10@demo.esta.test', 'dark', PHONE);
  await resetFiftyFifty(page, 10, 'thu-duc', '2019-11-20');
  await rest(page, 'PATCH', `household_members?id=eq.${seedId('seed:member:me-lane-10')}`, { locale: 'en', text_scale: 130 });
  try {
    await page.goto(legalPath(10, 'thu-duc'));
    await expect(page.getByRole('heading', { level: 2, name: 'Owners' })).toBeVisible();
    await page.getByTestId('edit-owners').click();
    await setShare(page, 'Nguyễn Thị Demo', '60');
    await setShare(page, 'Trần Minh Demo', '30');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await saveSheet(page);

    await page.reload();
    await expect(page.getByTestId('ownership-warning')).toHaveText('Ownership shares add up to 90%, short of 100%.');
    for (const row of await owners(page).getByTestId('owner-row').all()) {
      expect(await row.evaluate((element) => element.scrollWidth <= element.clientWidth), 'an owner row is not clipped').toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(await seriousAxeViolations(page)).toEqual([]);
  } finally {
    await rest(page, 'PATCH', `household_members?id=eq.${seedId('seed:member:me-lane-10')}`, { locale: 'vi', text_scale: 100 });
  }
});

test('a property with no owner offers Thêm chủ sở hữu, prefills the missing share and refuses three decimals', async ({ page }) => {
  await open(page, 'me.lane5@demo.esta.test', 'light', PHONE);
  await rest(page, 'POST', 'rpc/set_ownership_shares', { p_property_id: propertyId(5, 'q1'), p_shares: [] });
  await page.goto(legalPath(5, 'q1'));
  await expect(page.getByTestId('owners-empty')).toContainText('Chưa có chủ sở hữu.');
  await page.getByTestId('edit-owners').click();
  await page.getByTestId('holder-select').selectOption({ label: 'Nguyễn Thị Demo' });
  await expect(draft(page, 'Nguyễn Thị Demo').getByTestId('owner-share')).toHaveValue('100');
  await setShare(page, 'Nguyễn Thị Demo', '33,333');
  await page.getByTestId('save-ownership').click();
  await expect(page.getByTestId('ownership-error')).toBeVisible();
  await expect(draft(page, 'Nguyễn Thị Demo')).toContainText('tối đa 2 chữ số sau dấu phẩy');
  await setShare(page, 'Nguyễn Thị Demo', '100');
  await saveSheet(page);
  await expect(ownerRow(page, 'Nguyễn Thị Demo').getByTestId('owner-share-value')).toHaveText('100%');
  await expect(ownerRow(page, 'Nguyễn Thị Demo').getByTestId('owner-named-mark')).toHaveCount(1);
});
