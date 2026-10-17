import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Request } from '@playwright/test';
import { join } from 'node:path';
import { parseSlot } from '../scripts/slot.ts';
import { slotEnv } from '../scripts/slot-env.ts';
import { seedId } from '../supabase/seed/generator/ids.ts';
import { signIn } from './helpers/inbucket';

const repoRoot = join(import.meta.dirname, '..');
const env = slotEnv(repoRoot, parseSlot(process.env.ESTA_SLOT));
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const SIGNED_PHOTO = /\/storage\/v1\/object\/sign\/property-photos\//;
const TILE_HOST = 'https://tiles.openfreemap.org/';

const PLACE_LINK = 'https://www.google.com/maps/place/Demo+Long+An/@10.6,106.3,15z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d10.5331!4d106.4052';
const PARIS_LINK = 'https://www.google.com/maps/@48.8584,2.2945,17z';
const USERINFO_LINK = 'https://maps.app.goo.gl@127.0.0.1/x';

const propertyId = (lane: number, key: string) => seedId(`seed:property:lane-${lane}:${key}`);

function onlyOn(project: 'mobile' | 'desktop') {
  test.skip(test.info().project.name !== project, `runs at the ${project} viewport`);
}

/** No CI run depends on OpenFreeMap: each style is a stub with one vector layer, so a tile is still requested, and each tile is empty. */
async function stubTiles(page: Page): Promise<string[]> {
  const styles: string[] = [];
  await page.route(`${TILE_HOST}**`, async (route) => {
    const url = new URL(route.request().url());
    const style = /^\/styles\/([a-z]+)$/.exec(url.pathname)?.[1];
    if (style === undefined) return route.fulfill({ status: 200, contentType: 'application/x-protobuf', body: Buffer.alloc(0) });
    styles.push(style);
    return route.fulfill({
      json: {
        version: 8,
        name: `stub-${style}`,
        sources: { openmaptiles: { type: 'vector', tiles: [`${TILE_HOST}planet/stub/{z}/{x}/{y}.pbf`], maxzoom: 14 } },
        layers: [
          { id: 'background', type: 'background', paint: { 'background-color': style === 'dark' ? '#202228' : '#f2f3f5' } },
          { id: 'water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water', paint: { 'fill-color': '#9fb8d6' } },
        ],
      },
    });
  });
  return styles;
}

async function accessToken(page: Page): Promise<string> {
  const chunks = (await page.context().cookies())
    .filter((cookie) => /^sb-.+-auth-token(\.\d+)?$/.test(cookie.name))
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }))
    .map((cookie) => cookie.value)
    .join('');
  return (JSON.parse(Buffer.from(chunks.replace(/^base64-/, ''), 'base64url').toString('utf8')) as { access_token: string }).access_token;
}

async function rpc(page: Page, name: string, body: Record<string, unknown>): Promise<unknown> {
  const response = await page.request.post(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    headers: { apikey: anonKey, authorization: `Bearer ${await accessToken(page)}` },
    data: body,
  });
  expect(response.ok(), `${name} answered ${response.status()}`).toBe(true);
  return response.json();
}

type Stored = { lat: number | null; lng: number | null; has_boundary: boolean };

async function stored(page: Page, id: string): Promise<Stored> {
  const response = await page.request.get(`${supabaseUrl}/rest/v1/property_list_rows?id=eq.${id}&select=lat,lng,has_boundary`, {
    headers: { apikey: anonKey, authorization: `Bearer ${await accessToken(page)}` },
  });
  const [row] = (await response.json()) as Stored[];
  if (row === undefined) throw new Error(`no list row for ${id}`);
  return row;
}

/** Each lane's test starts from the seed, so a rerun on the same stack passes. */
async function restore(page: Page, id: string, location: { lat: number; lng: number } | null) {
  await rpc(page, 'set_property_location', { p_property_id: id, ...(location === null ? {} : { p_lat: location.lat, p_lng: location.lng }) });
  await rpc(page, 'set_property_boundary', { p_property_id: id, p_boundary: null });
}

async function openMap(page: Page, theme: 'light' | 'dark') {
  await page.context().addCookies([{ name: 'esta_theme', value: theme, url: test.info().project.use.baseURL ?? '' }]);
  await page.goto('/properties');
  await page.getByRole('navigation', { name: /^(Cách xem|View)$/ }).getByRole('link', { name: /^(Bản đồ|Map)$/ }).click();
  await expect(page).toHaveURL(/[?&]view=map/);
  await expect(page.getByTestId('map-canvas')).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
}

/** Properties on the map: a single pin counts one, a group of pins that would overlap counts its members. */
async function pinnedCount(page: Page): Promise<number> {
  const groups = await page.getByTestId('pin-group').allInnerTexts();
  return (await page.getByTestId('property-pin').count()) + groups.reduce((sum, text) => sum + Number(text), 0);
}

/** Taps the pin, first tapping the group that holds it until the map has zoomed far enough to split it. */
async function tapPin(page: Page, nickname: string) {
  const pin = page.getByTestId('property-pin').and(page.getByRole('button', { name: nickname, exact: true }));
  for (let tap = 0; tap < 4 && (await pin.count()) === 0; tap += 1) {
    await page.getByTestId('pin-group').and(page.getByRole('button', { name: new RegExp(nickname) })).click();
  }
  await pin.click();
}
const panel = (page: Page) => page.getByTestId('location-panel');

async function paste(page: Page, text: string) {
  const input = panel(page).getByRole('textbox', { name: /^(Liên kết Google Maps|Google Maps link)$/ });
  await input.fill(text);
  await input.evaluate((element, value) => {
    const data = new DataTransfer();
    data.setData('text', value);
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }, text);
}

async function seriousAxeViolations(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).exclude('.maplibregl-canvas').analyze();
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

async function expectRule1(page: Page, words: { unpinned: RegExp; edit: string }) {
  await expect.poll(() => pinnedCount(page)).toBe(6);
  const unpinned = page.getByTestId('unpinned-list');
  await expect(unpinned.getByRole('heading', { level: 2 })).toHaveText(words.unpinned);
  await expect(unpinned.getByRole('listitem')).toHaveCount(1);
  await expect(unpinned.getByRole('listitem')).toContainText('Đất vườn Long An');

  await tapPin(page, 'Dãy trọ Dĩ An');
  const card = page.getByTestId('pin-card');
  await expect(card.locator(':scope > *').first(), 'the card leads with the photo').toHaveAttribute('data-testid', 'pin-card-photo');
  await expect(card.locator('img')).toHaveAttribute('src', SIGNED_PHOTO);
  await expect.poll(() => card.locator('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBeGreaterThan(0);
  await expect(card.getByRole('heading', { name: 'Dãy trọ Dĩ An' })).toBeVisible();
  await expect(card).toContainText('Phường Dĩ An, TP. Hồ Chí Minh');
  await expect(card.getByRole('link', { name: words.edit })).toBeVisible();
}

async function expectRule5(page: Page, lane: number, words: { outside: string; saveAnyway: string; use: string; notMaps: RegExp }) {
  const id = propertyId(lane, 'long-an');
  await page.getByRole('link', { name: new RegExp(`Đất vườn Long An$`) }).click();
  await expect(panel(page)).toBeVisible();

  await paste(page, PARIS_LINK);
  await expect(panel(page).getByRole('alert')).toHaveText(words.outside);
  await expect(page.getByTestId('preview-pin')).toBeVisible();
  await expect(panel(page).getByRole('button', { name: words.use })).toHaveCount(0);
  await expect(panel(page).getByRole('button', { name: words.saveAnyway })).toBeVisible();
  expect((await stored(page, id)).lat, 'nothing is saved before Vẫn lưu').toBeNull();

  const actions: Request[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.headers()['next-action'] !== undefined) actions.push(request);
  });
  await paste(page, USERINFO_LINK);
  await expect(panel(page)).toContainText(words.notMaps);
  expect(actions, 'the userinfo link never reaches the server resolver').toEqual([]);
  expect((await stored(page, id)).lat).toBeNull();
}

test('rule 1: the map shows six pins, the unpinned line names Đất vườn Long An, and the pin card leads with the photo', async ({ page }) => {
  onlyOn('mobile');
  await stubTiles(page);
  await signIn(page, 'me.lane1@demo.esta.test');
  await restore(page, propertyId(1, 'long-an'), null);
  await openMap(page, 'light');
  await expectRule1(page, { unpinned: /^1 tài sản chưa có vị trí$/, edit: 'Sửa vị trí' });
  expect(await seriousAxeViolations(page)).toEqual([]);
});

test('rule 2: a pasted place link saves the !3d!4d point, offers Hoàn tác, and the unpinned line goes away', async ({ page }) => {
  onlyOn('mobile');
  await stubTiles(page);
  const id = propertyId(2, 'long-an');
  await signIn(page, 'me.lane2@demo.esta.test');
  await restore(page, id, null);
  await openMap(page, 'dark');

  await page.getByRole('link', { name: /Đất vườn Long An$/ }).click();
  await expect(page).toHaveURL(new RegExp(`locate=${id}`));
  await expect(panel(page).getByRole('heading', { level: 2 })).toBeFocused();
  await paste(page, PLACE_LINK);
  await expect(page.getByTestId('link-preview')).toContainText('10.5331, 106.4052');
  await expect(page.getByTestId('preview-pin')).toBeVisible();
  expect(await seriousAxeViolations(page)).toEqual([]);
  await panel(page).getByRole('button', { name: 'Dùng vị trí này' }).click();

  const toast = page.locator('[data-slot="toast"]');
  await expect(toast).toContainText('Đã lưu vị trí Đất vườn Long An.');
  await expect(toast.getByRole('button', { name: 'Hoàn tác' })).toBeVisible();
  await expect.poll(() => stored(page, id)).toMatchObject({ lat: 10.5331, lng: 106.4052 });

  await page.goto('/properties?view=map');
  await expect(page.getByTestId('unpinned-list').getByRole('heading', { level: 2 })).toHaveText('Mọi tài sản đều đã có vị trí trên bản đồ.');
  await expect.poll(() => pinnedCount(page)).toBe(7);
});

test('rule 3: dragging the Kho Biên Hòa pin and typing coordinates both persist, and the inputs match the pin', async ({ page }) => {
  onlyOn('desktop');
  await stubTiles(page);
  const id = propertyId(3, 'bien-hoa');
  await signIn(page, 'ryan.lane3@demo.esta.test');
  await restore(page, id, { lat: 10.97, lng: 106.846 });
  await openMap(page, 'light');
  await tapPin(page, 'Kho Biên Hòa');
  await page.getByTestId('pin-card').getByRole('link', { name: 'Sửa vị trí' }).click();
  await expect(panel(page)).toBeVisible();

  const pin = page.getByTestId('edit-pin');
  const box = await pin.boundingBox();
  if (box === null) throw new Error('the edit pin has no box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 60, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator('[data-slot="toast"]')).toContainText('Đã lưu vị trí Kho Biên Hòa.');
  await expect.poll(async () => (await stored(page, id)).lat).not.toBe(10.97);
  const dragged = await stored(page, id);
  expect(dragged.lat, 'dragging down moves the pin south').toBeLessThan(10.97);
  expect(dragged.lng, 'dragging right moves the pin east').toBeGreaterThan(106.846);

  await page.reload();
  const lat = panel(page).getByRole('textbox', { name: 'Vĩ độ' });
  const lng = panel(page).getByRole('textbox', { name: 'Kinh độ' });
  await expect(lat).toHaveValue(String(Number(dragged.lat?.toFixed(6))));
  await expect(lng).toHaveValue(String(Number(dragged.lng?.toFixed(6))));

  await lat.focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('10,9512');
  await page.keyboard.press('Tab');
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('106.8231');
  await page.keyboard.press('Enter');
  await expect.poll(() => stored(page, id)).toMatchObject({ lat: 10.9512, lng: 106.8231 });

  await page.reload();
  await expect(lat).toHaveValue('10.9512');
  await expect(lng).toHaveValue('106.8231');
  await expect(page.getByTestId('edit-pin')).toBeVisible();
});

test('rule 4: a 4-corner boundary saves with an estimate, a crossing ring is refused, and clearing undoes', async ({ page }) => {
  onlyOn('desktop');
  await stubTiles(page);
  const id = propertyId(4, 'bao-loc');
  await signIn(page, 'ryan.lane4@demo.esta.test');
  await restore(page, id, { lat: 11.547, lng: 107.808 });
  await openMap(page, 'dark');
  await tapPin(page, 'Đất Bảo Lộc');
  await page.getByTestId('pin-card').getByRole('link', { name: 'Sửa vị trí' }).click();
  await expect(panel(page)).toBeVisible();

  const canvas = await page.getByTestId('map-canvas').boundingBox();
  if (canvas === null) throw new Error('the map has no box');
  const cx = canvas.x + canvas.width / 2;
  const cy = canvas.y + canvas.height / 2;
  const corners = [
    [cx - 120, cy - 90],
    [cx + 120, cy - 90],
    [cx + 120, cy + 90],
    [cx - 120, cy + 90],
  ] as const;

  await panel(page).getByRole('button', { name: 'Vẽ ranh giới' }).click();
  await expect(page.getByTestId('map-canvas')).toHaveAttribute('data-draw-ready', 'true');
  for (const [x, y] of [...corners, corners[0]]) await page.mouse.click(x, y);
  const area = panel(page).getByTestId('boundary-area');
  await expect(area).toContainText('Ước tính');
  await expect(area).toContainText('m²');
  await panel(page).getByRole('button', { name: 'Lưu ranh giới' }).click();
  await expect(page.locator('[data-slot="toast"]')).toContainText('Đã lưu ranh giới Đất Bảo Lộc.');
  await expect.poll(async () => (await stored(page, id)).has_boundary).toBe(true);
  const saved = await rpc(page, 'property_boundary', { p_property_id: id });
  expect((saved as { coordinates: unknown[][] }).coordinates[0], 'four corners and the closing one').toHaveLength(5);

  await panel(page).getByRole('button', { name: 'Sửa ranh giới' }).click();
  await expect(page.getByTestId('map-canvas')).toHaveAttribute('data-draw-ready', 'true');
  const moved = await page.getByTestId('map-canvas').boundingBox();
  if (moved === null) throw new Error('the map has no box');
  const mx = moved.x + moved.width / 2;
  const my = moved.y + moved.height / 2;
  await page.mouse.move(mx + 120, my + 90);
  await page.mouse.down();
  await page.mouse.move(mx - 190, my - 40, { steps: 12 });
  await page.mouse.up();
  await expect(panel(page).getByText('Các cạnh của ranh giới cắt nhau. Hãy vẽ lại để các cạnh không cắt nhau.')).toBeVisible();
  await expect(panel(page).getByRole('button', { name: 'Lưu ranh giới' })).toBeDisabled();
  expect(await rpc(page, 'property_boundary', { p_property_id: id }), 'nothing saved for the crossing ring').toEqual(saved);
  await panel(page).getByRole('button', { name: 'Hủy' }).click();

  await panel(page).getByRole('button', { name: 'Xóa ranh giới' }).click();
  const toast = page.locator('[data-slot="toast"]').filter({ hasText: 'Đã xóa ranh giới Đất Bảo Lộc.' });
  await expect(toast).toBeVisible();
  await toast.getByRole('button', { name: 'Hoàn tác' }).click();
  await expect.poll(() => rpc(page, 'property_boundary', { p_property_id: id }), 'the undo brings back the 4-corner boundary').toEqual(saved);
  await expect(panel(page).getByTestId('boundary-area')).toContainText('Ước tính');

  await panel(page).getByRole('button', { name: 'Xóa ranh giới' }).click();
  await expect.poll(async () => (await stored(page, id)).has_boundary).toBe(false);
  await page.reload();
  await expect(panel(page).getByText('Chưa có ranh giới.')).toBeVisible();
  expect(await seriousAxeViolations(page)).toEqual([]);
});

test('rule 5: a point outside Vietnam warns and waits for Vẫn lưu, and a userinfo short link is refused in the browser', async ({ page }) => {
  onlyOn('mobile');
  await stubTiles(page);
  const id = propertyId(5, 'long-an');
  await signIn(page, 'me.lane5@demo.esta.test');
  await restore(page, id, null);
  await openMap(page, 'light');
  await expectRule5(page, 5, {
    outside: 'Điểm này nằm ngoài Việt Nam. Kiểm tra lại liên kết.',
    saveAnyway: 'Vẫn lưu',
    use: 'Dùng vị trí này',
    notMaps: /Đây không phải liên kết Google Maps\./,
  });

  await paste(page, PARIS_LINK);
  await panel(page).getByRole('button', { name: 'Vẫn lưu' }).click();
  await expect.poll(() => stored(page, id)).toMatchObject({ lat: 48.8584, lng: 2.2945 });
  await page.locator('[data-slot="toast"]').getByRole('button', { name: 'Hoàn tác' }).click();
  await expect.poll(async () => (await stored(page, id)).lat, 'Hoàn tác writes the empty pin back').toBeNull();
});

test('rule 6: the list loads no MapLibre chunk and no tile, and the map loads both', async ({ page }) => {
  onlyOn('mobile');
  await stubTiles(page);
  const seen: string[] = [];
  page.on('response', async (response) => {
    const url = response.url();
    if (url.startsWith(TILE_HOST)) seen.push(`tile ${url}`);
    else if (/\/_next\/static\/chunks\/.+\.js/.test(url) && (await response.text().catch(() => '')).includes('maplibre')) seen.push(`maplibre ${url}`);
  });
  await page.context().addCookies([{ name: 'esta_theme', value: 'dark', url: test.info().project.use.baseURL ?? '' }]);
  await signIn(page, 'me.lane6@demo.esta.test');
  await page.goto('/properties');
  await expect(page.getByTestId('property-card').first()).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(seen, 'the list view fetched nothing of the map').toEqual([]);

  await page.getByRole('link', { name: 'Bản đồ' }).click();
  await expect(page.getByTestId('map-canvas')).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
  await expect.poll(() => seen.some((entry) => entry.startsWith('maplibre '))).toBe(true);
  await expect.poll(() => seen.some((entry) => entry.startsWith(`tile ${TILE_HOST}planet/`))).toBe(true);
});

test('rule 7: in English at 130% and dark, the map, card and warning translate and nothing scrolls sideways', async ({ page }) => {
  onlyOn('mobile');
  const styles = await stubTiles(page);
  await page.context().addCookies([{ name: 'esta_theme', value: 'dark', url: test.info().project.use.baseURL ?? '' }]);
  await signIn(page, 'me.lane10@demo.esta.test');
  await restore(page, propertyId(10, 'long-an'), null);
  await page.goto('/settings');
  for (const choice of ['English', '130%']) await page.getByRole('radio', { name: new RegExp(`^${choice}`) }).check();
  await page.getByRole('button', { name: /^(Lưu|Save)$/ }).click();
  await expect(page.getByRole('status')).toHaveText(/^(Đã lưu cài đặt hiển thị\.|Display settings saved\.)$/);

  await openMap(page, 'dark');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('navigation', { name: 'View' }).getByRole('link', { name: 'Map' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('map-canvas')).toHaveAttribute('data-style', 'dark');
  expect(styles, 'the dark OpenFreeMap style is the one loaded').toEqual(['dark']);
  await expectRule1(page, { unpinned: /^1 property has no location$/, edit: 'Edit location' });
  await page.getByTestId('pin-card').getByRole('button', { name: 'Close' }).click();
  await expectRule5(page, 10, {
    outside: 'This point is outside Vietnam. Check the link.',
    saveAnyway: 'Save anyway',
    use: 'Use this location',
    notMaps: /This is not a Google Maps link\./,
  });
  expect(await page.locator('html').evaluate((html) => html.scrollWidth <= html.clientWidth), 'no horizontal page scroll').toBe(true);
  expect(await seriousAxeViolations(page)).toEqual([]);
});
