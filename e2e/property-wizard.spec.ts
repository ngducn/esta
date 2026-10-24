import { expect, test, type Page } from '@playwright/test';
import { e2eServiceHeaders } from '../scripts/e2e-service.ts';
import { startAgentWorker, stopAndForget, type AgentWorker } from './helpers/agent-worker';
import { setClock } from './helpers/test-clock';
import {
  acceptEvery,
  DESKTOP,
  editField,
  fixture,
  followReadyNotice,
  noSidewaysScroll,
  PHONE,
  rest,
  seriousAxeViolations,
  openNewHousehold,
  serviceGet,
  shot,
  START,
  startWizard,
  step,
  storedNames,
} from './helpers/wizard';

// PRP-7 and DOC-6 through the wizard. One worker and one test clock per slot, so the rules run in order in the `clock` project.
test.describe.configure({ mode: 'serial', timeout: 120_000 });
test.use({ video: process.env.ESTA_VIDEO === '1' ? { mode: 'on', size: PHONE } : 'off' });

let worker: AgentWorker | undefined;

async function startWorker() {
  await worker?.stop();
  worker = await startAgentWorker();
}

async function stopWorker() {
  await worker?.stop();
  worker = undefined;
}

test.beforeEach(async ({ request }) => {
  await setClock(request, START);
});

test.afterAll(async ({ request }) => {
  await stopAndForget(worker);
  await setClock(request, null);
});

const notice = (page: Page) => page.getByTestId('review-ready-notice');

async function expectAxeClean(page: Page, where: string) {
  expect(await seriousAxeViolations(page), where).toEqual([]);
}

/** Accepts every read field and, when the address confirm offers wards, picks `commune` or the first one. */
async function acceptAndConfirm(page: Page, commune?: string) {
  await acceptEvery(page);
  await page.getByTestId('review-submit').click();
  await expect(page.getByTestId('address-confirm')).toBeVisible({ timeout: 15_000 });
  const wards = page.locator('[data-testid="legacy-suggestions"] button');
  if ((await wards.count()) > 0) {
    await (commune === undefined ? wards.first() : page.locator(`[data-testid="legacy-suggestions"] [data-commune="${commune}"]`)).click();
    await expect(page.getByTestId('address-saved')).toBeVisible();
  }
}

async function finishFromOwners(page: Page) {
  await page.getByTestId('save-ownership').click();
  await step(page, 'use');
  await page.getByTestId('save-use').click();
  await step(page, 'finish');
}

async function runRule2(page: Page, label: string, evidence: string | null) {
  await stopWorker();
  const { propertyId, documentId } = await startWizard(page, { nickname: `Nhà phố An Phú Demo ${label}`, kind: 'townhouse', photo: await fixture('gcn_2024-photo').upload(), via: 'camera' });
  expect(await storedNames(page, documentId ?? ''), 'the wizard stores what the upload sheet does: the photo, its thumbnail and its review copy').toEqual([
    'page-1.jpg',
    'review.webp',
    'thumb.webp',
  ]);
  await page.getByTestId('skip-step').click();
  await step(page, 'owners');
  await expect(notice(page)).toHaveAttribute('data-state', 'reading');
  await expect(notice(page)).toContainText(/Trợ lý đang đọc|Trợ lý is reading/);
  await page.evaluate(() => Object.assign(window, { wizardNotReloaded: true }));
  await startWorker();
  await expect(notice(page)).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
  await expect(notice(page)).toHaveText(/^(Trợ lý đã đọc xong sổ\. Xem lại ngay|Trợ lý has read the certificate\. Check it now)$/);
  expect(await page.evaluate(() => 'wizardNotReloaded' in window), 'the notice changed without a reload').toBe(true);
  if (evidence !== null) await shot(page, `p2-08-review-ready-${evidence}`);
  await followReadyNotice(page);
  await expect(page.locator('img[data-testid="document-page"]'), 'the review opens the signed review copy').toHaveAttribute('src', new RegExp(`/${documentId}/review\\.webp\\?token=`));
  await acceptAndConfirm(page);
  await page.getByTestId('review-continue').click();
  await step(page, 'owners');
  await finishFromOwners(page);
  await expect(page.getByTestId('wizard-score')).toHaveAttribute('data-percent', /^\d+$/);
  return propertyId;
}

test('rule 2: Mẹ moves on to owners while Trợ lý reads the gcn_2024 photo, then follows the notice to the review', async ({ page }) => {
  await openNewHousehold(page, 'dark', PHONE);
  await page.goto('/properties/new');
  await expect(page.getByTestId('wizard-photo')).toBeVisible();
  await expectAxeClean(page, 'step photo');
  await shot(page, 'p2-08-step-photo-390x844-dark');
  const propertyId = await runRule2(page, 'lane 2', '390x844-dark');
  await expectAxeClean(page, 'step finish');
  await shot(page, 'p2-08-finish-390x844-dark');
  const truth = fixture('gcn_2024-photo').truth as { serial_no: { value: string } };
  await page.goto(`/properties/${propertyId}/legal`);
  await expect(page.getByText(truth.serial_no.value).first()).toBeVisible();
});

test('rule 3: Ryan skips the photo and finishes, then leaves a second wizard after owners and finds both on Tài sản', async ({ page }) => {
  await openNewHousehold(page, 'light', DESKTOP);
  await page.goto('/properties/new');
  await expect(page.getByTestId('wizard-photo')).toBeVisible();
  await shot(page, 'p2-08-step-photo-1440x900-light');
  const first = await startWizard(page, { nickname: 'Đất Củ Chi không sổ Demo', kind: 'residential_land', photo: null });
  expect(first.documentId).toBeNull();
  await expect(page.getByTestId('wizard-progress')).toHaveText('Bước 2/5: Thông tin');
  await expectAxeClean(page, 'step details');
  await page.getByTestId('skip-step').click();
  await step(page, 'owners');
  await expect(page.getByTestId('owners-note')).toHaveCount(0);
  await expectAxeClean(page, 'step owners');
  await page.getByTestId('skip-step').click();
  await step(page, 'use');
  await expectAxeClean(page, 'step use');
  await page.getByTestId('save-use').click();
  await step(page, 'finish');
  await expect(page.locator('[data-testid="missing-items"] [data-check="certificateDocument"]')).toBeVisible();
  await expectAxeClean(page, 'step finish');
  await shot(page, 'p2-08-finish-1440x900-light');
  expect(await serviceGet<unknown[]>(page, `documents?property_id=eq.${first.propertyId}&select=id`)).toEqual([]);

  const second = await startWizard(page, { nickname: 'Nhà bỏ dở Demo', kind: 'townhouse', photo: null });
  await page.getByTestId('skip-step').click();
  await step(page, 'owners');
  await page.getByRole('link', { name: 'Tài sản' }).first().click();
  await expect(page).toHaveURL(/\/properties$/);
  const card = page.getByTestId('property-card').filter({ has: page.locator(`a[href="/properties/${second.propertyId}"]`) });
  await expect(card).toBeVisible();
  await expect(card.getByTestId('completeness-ring')).toBeVisible();
  await page.goto(`/properties/${second.propertyId}`);
  const missing = page.locator('[data-testid="missing-items"] a').first();
  const [path] = ((await missing.getAttribute('href')) ?? '').split('#');
  expect(path).toMatch(new RegExp(`^/properties/${second.propertyId}/`));
  await missing.click();
  await expect(page).toHaveURL((url) => url.pathname === path);
});

test('rule 4: with the worker stopped and its heartbeat six minutes old, the wizard finishes and the review opens once it runs', async ({ page, request }) => {
  await stopWorker();
  await openNewHousehold(page, 'light', PHONE);
  await page.goto('/properties/new');
  await expect(page.getByTestId('wizard-photo')).toBeVisible();
  await shot(page, 'p2-08-step-photo-390x844-light');
  // Six minutes past the last beat of any worker, earlier rules' included, so no heartbeat is fresh.
  const [beat] = await serviceGet<{ last_seen_at: string }[]>(page, 'worker_heartbeats?select=last_seen_at&order=last_seen_at.desc&limit=1');
  const lastBeat = Math.max(Date.parse(beat?.last_seen_at ?? ''), Date.parse(START));
  await setClock(request, new Date(lastBeat + 6 * 60_000).toISOString());
  const { propertyId, documentId } = await startWizard(page, { nickname: 'Nhà Bình Thạnh Demo', kind: 'townhouse', photo: await fixture('gcn_2024-scan').upload() });
  await expect(notice(page)).toHaveAttribute('data-state', 'offline');
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(lastBeat);
  await expect(notice(page)).toContainText(`Trợ lý đang tạm nghỉ từ ${time}`);
  await shot(page, 'p2-08-offline-390x844-light');
  await page.getByTestId('skip-step').click();
  await step(page, 'owners');
  await expect(page.getByTestId('owners-note')).toHaveText('Có thể điền từ ảnh sổ khi Trợ lý đọc xong.');
  await finishFromOwners(page);
  await expect(page.getByTestId('wizard-score')).toBeVisible();

  await startWorker();
  await page.goto(`/properties/${propertyId}/documents`);
  const pill = page.locator(`[data-testid="document-tile"][data-document-id="${documentId}"] [data-testid="extraction-status"]`);
  await expect(pill).toHaveText('Chờ xem lại', { timeout: 30_000 });
  await pill.getByTestId('review-link').click();
  await expect(page).toHaveURL(`/documents/${documentId}/review`);
  await expect(page.getByTestId('extraction-field').first()).toBeVisible();
});

test('rule 5: Ryan adds the old Quận 3 sổ hồng; every current ward is offered, the chosen one is saved and the married couple own 50% each, not an older party of the same name', async ({ page }) => {
  await startWorker();
  await openNewHousehold(page, 'dark', DESKTOP);
  await page.goto('/properties/new');
  await expect(page.getByTestId('wizard-photo')).toBeVisible();
  await shot(page, 'p2-08-step-photo-1440x900-dark');
  const { propertyId } = await startWizard(page, { nickname: 'Nhà Lê Văn Sỹ Demo', kind: 'townhouse', photo: await fixture('so_hong_pre2009-scan').upload() });
  const [household] = await serviceGet<{ household_id: string }[]>(page, `properties?id=eq.${propertyId}&select=household_id`);
  const created = await page.request.post(`${rest}/parties`, {
    headers: { ...e2eServiceHeaders(), 'content-type': 'application/json', prefer: 'return=representation' },
    data: { household_id: household?.household_id, kind: 'individual', full_name: 'Phạm Minh Demo', tags: ['owner'] },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const [older] = (await created.json()) as { id: string }[];
  await expect(notice(page)).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
  await shot(page, 'p2-08-review-ready-1440x900-dark');
  await followReadyNotice(page);
  await expectAxeClean(page, 'step review');
  await editField(page, 'holders[0].id_last4', '');
  await acceptEvery(page);
  await page.getByTestId('review-submit').click();
  await expect(page.getByTestId('address-confirm')).toBeVisible({ timeout: 15_000 });
  await expectAxeClean(page, 'address confirm');
  const [property] = await serviceGet<{ certificate_address_text: string }[]>(page, `properties?id=eq.${propertyId}&select=certificate_address_text`);
  const candidates = await page.request.post(`${rest}/rpc/suggest_current_unit`, {
    headers: { ...e2eServiceHeaders(), 'content-type': 'application/json' },
    data: { p_text: property?.certificate_address_text },
  });
  const wards = ((await candidates.json()) as { commune_code: string }[]).map((row) => row.commune_code);
  expect(wards.length, 'the old ward maps to at least one current ward').toBeGreaterThan(0);
  const offered = page.locator('[data-testid="legacy-suggestions"] button');
  await expect(offered).toHaveCount(Math.min(wards.length, 6));
  expect(await offered.evaluateAll((buttons) => buttons.map((button) => button.getAttribute('data-commune')))).toEqual(wards.slice(0, 6));
  const chosen = wards.at(-1) ?? '';
  await page.locator(`[data-testid="legacy-suggestions"] [data-commune="${chosen}"]`).click();
  await expect(page.getByTestId('address-saved')).toBeVisible();
  const [saved] = await serviceGet<{ current_address: { commune_code: string } }[]>(page, `properties?id=eq.${propertyId}&select=current_address`);
  expect(saved?.current_address.commune_code).toBe(chosen);
  await page.getByTestId('review-continue').click();
  await step(page, 'details');
  await page.getByTestId('skip-step').click();

  await step(page, 'owners');
  await expect(page.getByTestId('owners-note')).toContainText('2 người đứng tên');
  await expect(page.getByTestId('owner-share')).toHaveCount(2);
  for (const share of await page.getByTestId('owner-share').all()) await expect(share).toHaveValue('50');
  for (const named of await page.getByTestId('owner-named').all()) await expect(named).toBeChecked();
  await expect(page.getByTestId('ownership-running-total')).toHaveText(/100%/);
  await finishFromOwners(page);
  await shot(page, 'p2-08-finish-1440x900-dark');
  const [certificate] = await serviceGet<{ holder_party_ids: string[] }[]>(page, `certificates?property_id=eq.${propertyId}&select=holder_party_ids`);
  const owners = await serviceGet<{ party_id: string }[]>(page, `ownership_shares?property_id=eq.${propertyId}&select=party_id`);
  expect(certificate?.holder_party_ids, 'the holder without ID digits got a party of their own').not.toContain(older?.id);
  expect(owners.map((owner) => owner.party_id).toSorted(), 'the owners are the holders the review linked').toEqual(certificate?.holder_party_ids.toSorted());
  await page.goto(`/properties/${propertyId}/legal`);
  await expect(page.getByTestId('owner-row')).toHaveCount(2);
  await expect(page.getByTestId('owner-named-mark')).toHaveCount(2);
  await expect(page.getByTestId('ownership-warning')).toHaveCount(0);
});

test('rule 6: Mẹ sets a rooming house to 8 rooms on the use step and Cho thuê lists Phòng 1 to Phòng 8', async ({ page }) => {
  await openNewHousehold(page, 'dark', PHONE);
  const { propertyId } = await startWizard(page, { nickname: 'Dãy trọ Thủ Đức mới Demo', kind: 'rooming_house', photo: null });
  await page.getByTestId('skip-step').click();
  await step(page, 'owners');
  await page.getByTestId('skip-step').click();
  await step(page, 'use');
  await page.getByTestId('room-count').fill('8');
  await page.getByTestId('save-use').click();
  await step(page, 'finish');
  await page.goto(`/properties/${propertyId}/rental`);
  const labels = Array.from({ length: 8 }, (_, index) => `Phòng ${index + 1}`);
  for (const label of labels) await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
  const units = await serviceGet<{ label: string }[]>(page, `units?property_id=eq.${propertyId}&kind=eq.room&select=label&order=sort_order`);
  expect(units.map((unit) => unit.label)).toEqual(labels);
});

test('rule 7: in English at 130% and dark, rule 2 reads in English, wraps long addresses and never scrolls sideways', async ({ page }) => {
  await openNewHousehold(page, 'dark', PHONE);
  await page.goto('/settings');
  for (const choice of ['English', '130%']) await page.getByRole('radio', { name: new RegExp(`^${choice}`) }).check();
  await page.getByRole('button', { name: /^(Lưu|Save)$/ }).click();
  await expect(page.getByRole('status')).toHaveText(/^(Đã lưu cài đặt hiển thị\.|Display settings saved\.)$/);
  await page.goto('/properties/new');
  await expect(page.getByRole('heading', { name: 'Do you have a photo of the certificate?' })).toBeVisible();
  expect(await noSidewaysScroll(page), 'photo step').toBe(true);
  await stopWorker();
  await startWizard(page, { nickname: 'Nhà phố Phường An Khánh Thành phố Thủ Đức cũ Thành phố Hồ Chí Minh Demo', kind: 'townhouse', photo: await fixture('gcn_2024-photo').upload(), via: 'camera' });
  await expect(page.getByTestId('wizard-progress')).toHaveText('Step 2 of 6: Details');
  expect(await noSidewaysScroll(page), 'details step').toBe(true);
  await page.getByTestId('skip-step').click();
  await step(page, 'owners');
  await expect(page.getByRole('heading', { name: 'Who owns this property?' })).toBeVisible();
  await expect(notice(page)).toContainText('Trợ lý is reading');
  await startWorker();
  await followReadyNotice(page);
  expect(await noSidewaysScroll(page), 'review step').toBe(true);
  await acceptAndConfirm(page);
  await expect(page.getByRole('heading', { name: 'Current address' })).toBeVisible();
  expect(await noSidewaysScroll(page), 'address confirm').toBe(true);
  await page.getByTestId('review-continue').click();
  await step(page, 'owners');
  await finishFromOwners(page);
  await expect(page.getByTestId('wizard-score')).toContainText('Completeness');
  await expect(page.getByRole('link', { name: 'Open the property' })).toBeVisible();
  expect(await noSidewaysScroll(page), 'finish step').toBe(true);
});

const SHOT_RUNS = [
  { viewport: PHONE, theme: 'light' },
  { viewport: PHONE, theme: 'dark' },
  { viewport: DESKTOP, theme: 'light' },
  { viewport: DESKTOP, theme: 'dark' },
] as const;

for (const run of SHOT_RUNS) {
  const size = `${run.viewport.width}x${run.viewport.height}-${run.theme}`;
  test(`evidence ${size}: every wizard state on the north-star certificate`, async ({ page, request }) => {
    test.skip(process.env.ESTA_WIZARD_SHOTS !== '1', 'screenshots for the PR body only');
    await stopWorker();
    await openNewHousehold(page, run.theme, run.viewport);
    await page.goto('/properties/new');
    await expect(page.getByTestId('wizard-photo')).toBeVisible();
    await shot(page, `p2-08-step-photo-${size}`);
    const [beat] = await serviceGet<{ last_seen_at: string }[]>(page, 'worker_heartbeats?select=last_seen_at&order=last_seen_at.desc&limit=1');
    await setClock(request, new Date(Math.max(Date.parse(beat?.last_seen_at ?? ''), Date.parse(START)) + 6 * 60_000).toISOString());
    const { propertyId } = await startWizard(page, { nickname: 'Dãy trọ Dĩ An Demo', kind: 'rooming_house', photo: await fixture('northstar-di-an').upload() });
    await expect(notice(page)).toHaveAttribute('data-state', 'offline');
    await shot(page, `p2-08-offline-${size}`);
    await startWorker();
    await page.reload();
    await shot(page, `p2-08-step-details-${size}`);
    await page.getByTestId('skip-step').click();
    await step(page, 'owners');
    await expect(notice(page)).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
    await shot(page, `p2-08-review-ready-${size}`);
    await followReadyNotice(page);
    await shot(page, `p2-08-step-review-${size}`);
    await acceptEvery(page);
    await page.getByTestId('review-submit').click();
    await expect(page.getByTestId('address-confirm')).toBeVisible({ timeout: 15_000 });
    await page.locator('[data-testid="legacy-suggestions"] [data-commune="25942"]').click();
    await expect(page.getByTestId('address-saved')).toBeVisible();
    await shot(page, `p2-08-address-confirm-${size}`);
    await page.getByTestId('review-continue').click();
    await step(page, 'owners');
    await shot(page, `p2-08-step-owners-${size}`);
    await page.getByTestId('save-ownership').click();
    await step(page, 'use');
    await page.getByTestId('room-count').fill('8');
    await shot(page, `p2-08-step-use-${size}`);
    await page.getByTestId('save-use').click();
    await step(page, 'finish');
    await shot(page, `p2-08-finish-${size}`);
    await page.goto(`/properties/${propertyId}`);
    await expect(page.getByTestId('property-addresses').locator('[data-line="legal"]')).toBeVisible();
    await shot(page, `p2-08-northstar-header-${size}`);
  });
}
