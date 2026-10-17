import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
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
const party = (person: 'me' | 'ryan', lane: number) => seedId(`seed:party:${person}-lane-${lane}`);

// Each rule reads or writes its own lane household, so the spec runs at one project's viewport and sets the rule's own.
test.beforeEach(() => test.skip(test.info().project.name !== 'mobile', 'each rule sets its own viewport'));

async function open(page: Page, email: string, theme: 'light' | 'dark', viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  await page.context().addCookies([{ name: 'esta_theme', value: theme, url: test.info().project.use.baseURL ?? '' }]);
  await signIn(page, email);
}

async function rest(page: Page, method: 'POST' | 'PATCH', path: string, data: unknown) {
  const response = await page.request.fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method,
    headers: { apikey: anonKey, authorization: `Bearer ${await accessToken(page)}`, 'content-type': 'application/json' },
    data,
  });
  expect(response.ok(), await response.text()).toBe(true);
}

/** Puts the lane's Long An parcel back to its seed state, with no number and no area. */
const blankLongAnParcel = (page: Page, lane: number) =>
  rest(page, 'PATCH', `parcels?id=eq.${seedId(`seed:parcel:lane-${lane}:long-an:1`)}`, { parcel_no: null, map_sheet_no: null, area_m2: null });

async function resetFiftyFifty(page: Page, lane: number) {
  const share = (person: 'me' | 'ryan') => ({ party_id: party(person, lane), share_bp: 5000, named_on_certificate: true, since: '2019-11-20' });
  await rest(page, 'POST', 'rpc/set_ownership_shares', { p_property_id: propertyId(lane, 'thu-duc'), p_shares: [share('me'), share('ryan')] });
}

async function seriousAxeViolations(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id} ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

const block = (page: Page) => page.getByTestId('property-header').getByTestId('property-completeness');
const headerPercent = async (page: Page) => Number(await block(page).getByTestId('completeness-ring').getAttribute('data-percent'));
const items = (page: Page) => page.getByTestId('missing-items').getByRole('listitem');
const cardRings = (page: Page) => page.getByTestId('property-card').getByTestId('completeness-ring');
/** Where the property tabs sit on the first screen, and where the app's bottom bar covers it. */
async function tabBarFold(page: Page) {
  const bottomBar = await page.getByRole('navigation', { name: 'Các mục chính' }).evaluate((nav) => nav.getBoundingClientRect().top);
  return page.getByRole('navigation', { name: 'Các mục của tài sản' }).evaluate((nav, covered) => {
    const { top, bottom } = nav.getBoundingClientRect();
    return { top: top + window.scrollY, bottom: bottom + window.scrollY, covered };
  }, bottomBar);
}
/** A form keeps its fields disabled until React owns the page, and focus lands in the same commit, so wait for the field to enable before asserting focus. */
async function expectFocusLanded(field: Locator) {
  await expect(field).toBeEnabled({ timeout: 30_000 });
  await expect(field).toBeFocused();
}
const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

async function openFromSearch(page: Page, query: string, nickname: string) {
  await page.goto('/properties');
  await page.getByRole('searchbox').fill(query);
  await expect(page).toHaveURL(new RegExp(`\\?q=${query.replace(' ', '\\+')}$`));
  await page.getByTestId('property-card').getByRole('link', { name: nickname, exact: true }).click();
}

test('rules 1 and 2: Mẹ finds Đất vườn Long An below 60%, taps the parcel number item, saves 906 and 96, and the item goes (PRP-6)', async ({ page }) => {
  await open(page, 'me.lane1@demo.esta.test', 'light', PHONE);
  await blankLongAnParcel(page, 1);
  try {
    await openFromSearch(page, 'long an', 'Đất vườn Long An');
    await expect(page).toHaveURL(new RegExp(`/properties/${propertyId(1, 'long-an')}$`));
    const before = await headerPercent(page);
    expect(before).toBeLessThan(60);
    await expect(items(page)).toHaveCount(3);
    await expect(items(page).first()).toHaveText('Thêm số thửa và số tờ bản đồ');
    const fold = await tabBarFold(page);
    expect(fold.top, 'the property tabs start on the first screen').toBeLessThanOrEqual(PHONE.height);
    expect(fold.bottom, 'the bottom bar does not cover the property tabs').toBeLessThanOrEqual(fold.covered);
    await expect(items(page).nth(1)).toHaveText('Thêm diện tích thửa đất');
    expect(await seriousAxeViolations(page)).toEqual([]);

    await items(page).first().getByRole('link').click();
    await expect(page).toHaveURL(new RegExp(`/legal/parcels/${seedId('seed:parcel:lane-1:long-an:1')}#parcel-no$`));
    await expectFocusLanded(page.locator('#parcel-no'));
    expect(await seriousAxeViolations(page)).toEqual([]);
    await page.keyboard.type('906');
    await page.locator('#map-sheet-no').fill('96');
    await page.getByTestId('save-legal-item').click();
    await expect(page).toHaveURL(new RegExp(`/properties/${propertyId(1, 'long-an')}/legal$`));

    await page.getByRole('navigation', { name: 'Các mục của tài sản' }).getByRole('link', { name: 'Tổng quan' }).click();
    await expect(page).toHaveURL(new RegExp(`/properties/${propertyId(1, 'long-an')}$`));
    await expect.poll(() => headerPercent(page)).toBeGreaterThan(before);
    await expect(items(page).filter({ hasText: 'Thêm số thửa và số tờ bản đồ' })).toHaveCount(0);
    await expect(items(page).first()).toHaveText('Thêm diện tích thửa đất');
  } finally {
    await blankLongAnParcel(page, 1);
  }
});

test('rule 3: Ryan sorts Tài sản by Mức đầy đủ, Đất vườn Long An leads below 60%, and Mặt bằng Quận 1 asks for its accounts (PRP-6, PRP-8)', async ({ page }) => {
  await open(page, 'ryan.lane2@demo.esta.test', 'dark', DESKTOP);
  await page.goto('/properties');
  await page.getByRole('combobox', { name: /^Sắp xếp/ }).selectOption({ label: 'Mức đầy đủ' });
  await expect(page).toHaveURL(/[?&]sort=completeness/);
  const cards = page.getByTestId('property-card');
  await expect(cards.first().getByRole('heading', { level: 2 })).toHaveText('Đất vườn Long An');
  await expect(cardRings(page)).toHaveCount(7);
  const percents = (await cardRings(page).evaluateAll((rings) => rings.map((ring) => ring.getAttribute('data-percent')))).map(Number);
  expect(percents[0]).toBeLessThan(60);
  expect(percents.slice(1).every((percent) => percent >= 60), `other rings ${percents.slice(1).join(', ')}`).toBe(true);
  expect(percents, 'least complete first').toEqual(percents.toSorted((a, b) => a - b));
  expect(await seriousAxeViolations(page)).toEqual([]);

  await cards.getByRole('link', { name: 'Mặt bằng Quận 1', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/properties/${propertyId(2, 'q1')}$`));
  await expect(items(page)).toHaveText(['Thêm tài khoản điện, nước']);
  await expect(items(page).getByRole('link')).toHaveAttribute('href', `/properties/${propertyId(2, 'q1')}/rental/accounts/new#account-kind`);
  await items(page).getByRole('link').click();
  await expectFocusLanded(page.locator('#account-kind'));
  expect(await seriousAxeViolations(page)).toEqual([]);
});

test('rule 4: Ryan sets Căn hộ Thủ Đức to 60% and 30%, the score drops and the owners item links to legal#owners (PRP-3)', async ({ page }) => {
  await open(page, 'ryan.lane3@demo.esta.test', 'light', DESKTOP);
  await resetFiftyFifty(page, 3);
  const id = propertyId(3, 'thu-duc');
  try {
    await page.goto(`/properties/${id}`);
    await expect(page.getByTestId('completeness-complete')).toHaveText('Đã đủ thông tin');
    const before = await headerPercent(page);
    await page.goto(`/properties/${id}/legal`);
    await page.getByTestId('edit-owners').click();
    await page.getByTestId('owner-draft').filter({ hasText: 'Nguyễn Thị Demo' }).getByTestId('owner-share').fill('60');
    await page.getByTestId('owner-draft').filter({ hasText: 'Trần Minh Demo' }).getByTestId('owner-share').fill('30');
    await page.getByTestId('save-ownership').click();
    await expect(page.getByTestId('ownership-sheet')).toHaveCount(0);

    await page.reload();
    await expect.poll(() => headerPercent(page)).toBeLessThan(before);
    await page.goto(`/properties/${id}`);
    const owners = items(page).filter({ hasText: 'Sửa tỷ lệ sở hữu cho đủ 100%' });
    await expect(owners.getByRole('link')).toHaveAttribute('href', `/properties/${id}/legal#owners`);
    await owners.getByRole('link').click();
    await expectFocusLanded(page.getByTestId('edit-owners'));
    expect(await seriousAxeViolations(page)).toEqual([]);
  } finally {
    await resetFiftyFifty(page, 3);
  }
});

test('rule 5: in English at 130% and dark, Dĩ An, its tabs and the map read in English with no sideways scroll', async ({ page }) => {
  await open(page, 'me.lane10@demo.esta.test', 'dark', PHONE);
  await rest(page, 'PATCH', `household_members?id=eq.${seedId('seed:member:me-lane-10')}`, { locale: 'en', text_scale: 130 });
  try {
    await openFromSearch(page, 'di an', 'Dãy trọ Dĩ An');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(block(page)).toContainText('Completeness');
    expect(await noSideScroll(page), 'overview').toBe(true);
    expect(await seriousAxeViolations(page)).toEqual([]);
    for (const tab of ['Legal', 'Rental']) {
      await page.getByRole('link', { name: tab, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/${tab.toLowerCase()}$`));
      await expect(block(page)).toContainText('Completeness');
      await expect(block(page)).not.toContainText(/[ăâđêôơư]/i);
      expect(await noSideScroll(page), tab).toBe(true);
    }
    await page.goto('/properties?view=map');
    await expect(page.getByRole('heading', { level: 1, name: 'Properties' })).toBeVisible();
    expect(await noSideScroll(page), 'map').toBe(true);
  } finally {
    await rest(page, 'PATCH', `household_members?id=eq.${seedId('seed:member:me-lane-10')}`, { locale: 'vi', text_scale: 100 });
  }
});
