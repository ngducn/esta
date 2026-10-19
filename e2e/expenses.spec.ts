import { expect, test, type Locator, type Page } from '@playwright/test';
import { join } from 'node:path';
import { seedId } from '../supabase/seed/generator/ids.ts';
import { setClock } from './helpers/test-clock';
import { memberRest as rest } from './helpers/auth-api';
import { DESKTOP, noSidewaysScroll, open, PHONE, seriousAxeViolations } from './helpers/wizard';

const repoRoot = join(import.meta.dirname, '..');
const NBSP = ' ';
const SPEC_TODAY = '2026-10-07T09:00:00+07:00';
const RECEIPT = join(repoRoot, 'fixtures', 'receipts', 'demo-receipt-q7.jpg');
const vnd = (text: string) => `${text}${NBSP}₫`;
const q7 = (lane: number) => seedId(`seed:property:lane-${lane}:q7`);
const memberRow = (person: 'me' | 'ryan', lane: number) => `household_members?id=eq.${seedId(`seed:member:${person}-lane-${lane}`)}`;
/** Seed rows are stamped with the seed's as-of; anything later was written by a test. */
const WRITTEN_BY_TESTS = 'created_at=gt.2026-10-08T00:00:00Z';

// `ESTA_E2E_VIDEO=1` records each rule at the phone size, for the PR's video of an expense typed in and one from a photo.
const recording = process.env.ESTA_E2E_VIDEO === '1';
test.use(recording ? { video: { mode: 'on', size: PHONE }, launchOptions: { slowMo: 700 } } : { video: 'off' });
const holdForRecording = (page: Page) => (recording ? page.waitForTimeout(2000) : Promise.resolve());
// `ESTA_E2E_SHOTS=<dir>` saves each rule's passing state as `<dir>/p4-02-<slug>.png`, the PR's lane screenshots.
const shots = process.env.ESTA_E2E_SHOTS;
/** Reduced motion turns transitions off and the pointer is parked, so axe and a screen never catch a chip mid-fade or hovered. */
const still = async (page: Page) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.mouse.move(0, 0);
};
const settledAxe = async (page: Page) => {
  await still(page);
  return seriousAxeViolations(page);
};
const shot = async (page: Page, slug: string, focus?: Locator) => {
  if (shots === undefined) return;
  await still(page);
  // Centred, because a phone's fixed tab bar covers whatever only just scrolled into view at the bottom.
  if (focus !== undefined) await focus.first().evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: join(shots, `p4-02-${slug}.png`) });
};

// The sheet dates an expense on the Clock's day, so the spec runs in the `clock` project on SPEC §9.3's day. Each rule
// reads its own lane household, and every expense, vendor and receipt a rule adds is removed after it.
test.beforeEach(async ({ request }) => {
  test.slow(recording, 'slow motion for the video triples each step');
  await setClock(request, SPEC_TODAY);
});

test.afterEach(async ({ page }) => {
  if (!(await page.context().cookies()).some((cookie) => cookie.name.startsWith('sb-'))) return;
  await page.context().setOffline(false);
  await rest(page, 'PATCH', `expenses?${WRITTEN_BY_TESTS}&deleted_at=is.null`, { deleted_at: SPEC_TODAY });
  await rest(page, 'PATCH', `documents?${WRITTEN_BY_TESTS}&category=eq.invoice_receipt&deleted_at=is.null`, { deleted_at: SPEC_TODAY });
});

const liveExpenses = (page: Page, lane: number) => rest<{ id: string }[]>(page, 'GET', `expenses?property_id=eq.${q7(lane)}&deleted_at=is.null&select=id`);

const sheet = (page: Page) => page.getByTestId('expense-sheet');
const toast = (page: Page) => page.getByRole('region', { name: /Thông báo|Notifications/ });
const rows = (page: Page) => page.getByTestId('expense-row');

/** Taps a category chip; its radio is visually hidden inside the label, as on a phone. */
async function pick(page: Page, category: string) {
  await sheet(page).getByRole('radio', { name: category, exact: true }).locator('xpath=..').click();
  await expect(sheet(page).getByRole('radio', { name: category, exact: true })).toBeChecked();
}

async function typeAmount(page: Page, text: string) {
  await sheet(page).getByRole('textbox', { name: /^(Số tiền|Amount)$/ }).fill(text);
}

test('rule 1: on Nhà phố Q7 Mẹ types 2tr5, picks Sửa chữa and saves; the toast offers Hoàn tác and Thu chi lists the row', async ({ page }) => {
  await open(page, 'me.lane1@demo.esta.test', 'light', PHONE);
  const before = await liveExpenses(page, 1);
  await page.goto(`/properties/${q7(1)}`);
  await holdForRecording(page);
  await page.getByTestId('add-expense').click();
  await expect(sheet(page).getByRole('heading', { name: 'Thêm chi phí' })).toBeVisible();
  await typeAmount(page, '2tr5');
  await expect(sheet(page).getByTestId('money-preview')).toHaveText(vnd('2.500.000'));
  await pick(page, 'Sửa chữa');
  await expect(sheet(page).getByTestId('expense-date')).toHaveText('Hôm nay, 07/10/2026');
  expect(await settledAxe(page)).toEqual([]);
  await shot(page, 'sheet-filled');
  await holdForRecording(page);
  await sheet(page).getByTestId('expense-save').click();
  await expect(sheet(page)).toBeHidden();
  await expect(toast(page)).toContainText(`Đã ghi nhận chi phí ${vnd('2.500.000')}.`);
  await expect(toast(page).getByRole('button', { name: 'Hoàn tác' })).toBeVisible();
  await shot(page, 'saved-toast');
  expect((await liveExpenses(page, 1)).length, 'one more live expense on q7').toBe(before.length + 1);

  await page.getByRole('navigation', { name: 'Các mục của tài sản' }).getByRole('link', { name: 'Thu chi' }).click();
  const newest = rows(page).first();
  await expect(newest.getByTestId('expense-category')).toHaveText('Sửa chữa');
  await expect(newest.getByTestId('expense-amount')).toHaveText(vnd('2.500.000'));
  await expect(newest.getByTestId('expense-date')).toHaveText('07/10/2026');
  expect(await settledAxe(page)).toEqual([]);
  await shot(page, 'regression-add', page.getByTestId('expense-section'));
  await holdForRecording(page);
});

test('rule 1b: Hoàn tác on the saved toast takes the new expense back off', async ({ page }) => {
  await open(page, 'me.lane1@demo.esta.test', 'light', PHONE);
  const before = await liveExpenses(page, 1);
  await page.goto(`/properties/${q7(1)}/finance`);
  await page.getByTestId('expense-section').getByTestId('add-expense').click();
  await typeAmount(page, '700k');
  await pick(page, 'Bảo trì');
  await sheet(page).getByTestId('expense-save').click();
  await expect(rows(page).first().getByTestId('expense-amount')).toHaveText(vnd('700.000'));
  await toast(page).getByRole('button', { name: 'Hoàn tác' }).click();
  await expect(toast(page)).toContainText(`Đã bỏ khoản chi ${vnd('700.000')}.`);
  await expect(rows(page).getByTestId('expense-amount').filter({ hasText: vnd('700.000') })).toHaveCount(0);
  expect((await liveExpenses(page, 1)).length).toBe(before.length);
});

test('rule 2: Chụp hoá đơn with the Demo receipt, 850k, saves a row with a receipt link to the signed photo', async ({ page }) => {
  await open(page, 'me.lane2@demo.esta.test', 'light', PHONE);
  await page.goto(`/properties/${q7(2)}/finance`);
  await holdForRecording(page);
  const camera = page.getByTestId('expense-section').getByTestId('receipt-camera');
  await expect(camera, 'the camera input waits for hydration, so a photo is never lost').toBeEnabled();
  await camera.setInputFiles(RECEIPT);
  await expect(sheet(page).getByTestId('receipt-preview')).toBeVisible();
  await typeAmount(page, '850k');
  await pick(page, 'Sửa chữa');
  await expect(sheet(page).getByTestId('receipt-uploaded')).toBeVisible();
  await shot(page, 'receipt-sheet');
  await holdForRecording(page);
  await sheet(page).getByTestId('expense-save').click();
  await expect(toast(page)).toContainText(`Đã ghi nhận chi phí ${vnd('850.000')}.`);

  const row = rows(page).filter({ has: page.getByTestId('expense-amount').getByText(vnd('850.000'), { exact: true }) });
  await expect(row.getByTestId('expense-receipt-link')).toBeVisible();
  await shot(page, 'receipt-photo', row);
  const [saved] = await rest<{ document_id: string; documents: { category: string; property_id: string } }[]>(
    page,
    'GET',
    `expenses?property_id=eq.${q7(2)}&amount_vnd=eq.850000&deleted_at=is.null&select=document_id,documents(category,property_id)`,
  );
  expect(saved?.documents).toEqual({ category: 'invoice_receipt', property_id: q7(2) });
  await row.getByTestId('expense-receipt-link').click();
  await expect(page).toHaveURL(new RegExp(`/documents/${saved?.document_id}$`));
  await expect(page.locator('img[data-testid="document-page"]')).toBeVisible();
  await page.locator('img[data-testid="document-page"]').evaluate((img: HTMLImageElement) => img.decode());
  await shot(page, 'receipt-opened');
  await holdForRecording(page);
});

test('rule 2b: a receipt photo cancelled with the sheet, or dropped before saving, never reaches Tài liệu', async ({ page }) => {
  await open(page, 'me.lane2@demo.esta.test', 'light', PHONE);
  const receipts = () => rest<unknown[]>(page, 'GET', `documents?property_id=eq.${q7(2)}&category=eq.invoice_receipt&deleted_at=is.null&select=id`);
  const before = (await receipts()).length;
  await page.goto(`/properties/${q7(2)}/finance`);
  const camera = page.getByTestId('expense-section').getByTestId('receipt-camera');
  await expect(camera).toBeEnabled();
  await camera.setInputFiles(RECEIPT);
  await expect(sheet(page).getByTestId('receipt-uploaded')).toBeVisible();
  await sheet(page).getByRole('button', { name: 'Huỷ' }).click();
  await expect(sheet(page)).toBeHidden();
  expect((await receipts()).length, 'a cancelled sheet files no receipt').toBe(before);

  await page.getByTestId('expense-section').getByTestId('add-expense').click();
  await sheet(page).getByTestId('sheet-receipt-file').setInputFiles(RECEIPT);
  await expect(sheet(page).getByTestId('receipt-uploaded')).toBeVisible();
  await sheet(page).getByTestId('receipt-remove').click();
  await expect(sheet(page).getByTestId('receipt-preview')).toHaveCount(0);
  await typeAmount(page, '640k');
  await pick(page, 'Bảo trì');
  await sheet(page).getByTestId('expense-save').click();
  await expect(toast(page)).toContainText(`Đã ghi nhận chi phí ${vnd('640.000')}.`);
  const [saved] = await rest<{ document_id: string | null }[]>(page, 'GET', `expenses?property_id=eq.${q7(2)}&amount_vnd=eq.640000&deleted_at=is.null&select=document_id`);
  expect(saved).toEqual({ document_id: null });
  expect((await receipts()).length, 'a dropped photo is not filed').toBe(before);
});

test('rule 3: at 1440 dark the field reads 3,5tr as 3.500.000 ₫ before saving', async ({ page }) => {
  await open(page, 'ryan.lane3@demo.esta.test', 'dark', DESKTOP);
  await page.goto(`/properties/${q7(3)}/finance`);
  await page.getByTestId('expense-section').getByTestId('add-expense').click();
  await typeAmount(page, '3,5tr');
  await expect(sheet(page).getByTestId('money-preview')).toHaveText(vnd('3.500.000'));
  expect(await settledAxe(page)).toEqual([]);
  await shot(page, 'shorthand');
});

test('rule 4: a vendor added from the sheet is saved as a contractor and its long name wraps on the row', async ({ page }) => {
  const name = 'Thợ điện Demo Phường Tân Đông Hiệp';
  await open(page, 'me.lane4@demo.esta.test', 'dark', PHONE);
  await page.goto(`/properties/${q7(4)}/finance`);
  await page.getByTestId('expense-section').getByTestId('add-expense').click();
  await typeAmount(page, '1tr8');
  await pick(page, 'Sửa chữa');
  await sheet(page).getByTestId('expense-vendor').selectOption({ label: 'Thêm người nhận mới' });
  await sheet(page).getByTestId('expense-vendor-name').fill(name);
  await sheet(page).getByTestId('expense-save').click();
  await expect(toast(page)).toContainText(`Đã ghi nhận chi phí ${vnd('1.800.000')}.`);
  const vendor = rows(page).getByTestId('expense-vendor-name').filter({ hasText: name });
  await expect(vendor).toHaveText(name);
  expect(await vendor.evaluate((element) => element.scrollWidth <= element.clientWidth), 'the vendor name is not clipped').toBe(true);
  expect(await noSidewaysScroll(page)).toBe(true);
  await shot(page, 'vendor', vendor);
  const parties = await rest<{ id: string; tags: string[] }[]>(page, 'GET', `parties?full_name=eq.${encodeURIComponent(name)}&select=id,tags`);
  expect(parties.map((party) => party.tags)).toEqual([['contractor']]);
  await rest(page, 'DELETE', `parties?full_name=eq.${encodeURIComponent(name)}`);
});

test('rule 5: deleting a seeded Q7 repair offers Hoàn tác, which brings the same row back', async ({ page }) => {
  const seeded = seedId('seed:expense:lane-5:q7:2026-08:1');
  await open(page, 'ryan.lane5@demo.esta.test', 'light', DESKTOP);
  await page.goto(`/properties/${q7(5)}/finance`);
  const row = page.locator(`[data-expense-id="${seeded}"]`);
  await row.getByTestId('expense-row-edit').click();
  await expect(sheet(page).getByRole('heading', { name: 'Sửa chi phí' })).toBeVisible();
  await sheet(page).getByTestId('expense-delete').click();
  await expect(toast(page)).toContainText(`Đã xoá chi phí ${vnd('4.500.000')}.`);
  await expect(row).toHaveCount(0);
  await toast(page).getByRole('button', { name: 'Hoàn tác' }).click();
  await expect(toast(page)).toContainText(`Đã khôi phục chi phí ${vnd('4.500.000')}.`);
  await expect(row).toBeVisible();
  await shot(page, 'undo', row);
  expect(await rest(page, 'GET', `expenses?id=eq.${seeded}&select=deleted_at`)).toEqual([{ deleted_at: null }]);
});

test('rule 6: an amount of 0 is refused on the field in Vietnamese and nothing is written', async ({ page }) => {
  await open(page, 'me.lane6@demo.esta.test', 'light', PHONE);
  const before = await liveExpenses(page, 6);
  await page.goto(`/properties/${q7(6)}/finance`);
  await page.getByTestId('expense-section').getByTestId('add-expense').click();
  await typeAmount(page, '0');
  await pick(page, 'Sửa chữa');
  await sheet(page).getByTestId('expense-save').click();
  await expect(sheet(page).getByText('Số tiền phải lớn hơn 0.')).toBeVisible();
  await expect(sheet(page).getByRole('textbox', { name: 'Số tiền' })).toHaveAttribute('aria-invalid', 'true');
  await shot(page, 'invalid');
  expect(await liveExpenses(page, 6)).toEqual(before);
});

test('rule 6c: an amount above 1.000 tỷ is refused on the field in Vietnamese and nothing is written', async ({ page }) => {
  await open(page, 'me.lane6@demo.esta.test', 'light', PHONE);
  const before = await liveExpenses(page, 6);
  await page.goto(`/properties/${q7(6)}/finance`);
  await page.getByTestId('expense-section').getByTestId('add-expense').click();
  await typeAmount(page, '1001 tỷ');
  await pick(page, 'Sửa chữa');
  await sheet(page).getByTestId('expense-save').click();
  await expect(sheet(page).getByText('Số tiền chưa đúng. Số này lớn hơn mức Esta ghi được.')).toBeVisible();
  await expect(sheet(page).getByRole('textbox', { name: 'Số tiền' })).toHaveAttribute('aria-invalid', 'true');
  await expect(sheet(page).getByTestId('expense-error')).toHaveCount(0);
  expect(await liveExpenses(page, 6)).toEqual(before);
});

test('rule 6b: saving with no kind chosen asks for one and writes nothing', async ({ page }) => {
  await open(page, 'me.lane6@demo.esta.test', 'light', PHONE);
  const before = await liveExpenses(page, 6);
  await page.goto(`/properties/${q7(6)}/finance`);
  await page.getByTestId('expense-section').getByTestId('add-expense').click();
  await typeAmount(page, '500k');
  await sheet(page).getByTestId('expense-save').click();
  await expect(sheet(page).getByText('Chọn loại chi phí.')).toBeVisible();
  expect(await liveExpenses(page, 6)).toEqual(before);
});

test('rule 7: in compact density the Sửa chữa rows of Q7 for 2026 add up to the seed README total', async ({ page }) => {
  await open(page, 'ryan.lane7@demo.esta.test', 'dark', DESKTOP);
  await rest(page, 'PATCH', memberRow('ryan', 7), { density: 'compact' });
  try {
    await page.goto(`/properties/${q7(7)}/finance?year=2026`);
    await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
    await expect(page.getByRole('heading', { name: 'Chi phí năm 2026' })).toBeVisible();
    const repairs = rows(page).filter({ has: page.getByTestId('expense-category').getByText('Sửa chữa', { exact: true }) });
    const amounts = await repairs.getByTestId('expense-amount').allTextContents();
    const total = amounts.reduce((sum, text) => sum + Number(text.replace(/\D/g, '')), 0);
    expect(total).toBe(8_650_000);
    expect(await settledAxe(page)).toEqual([]);
    await shot(page, 'seed-list', page.getByTestId('expense-section'));
  } finally {
    await rest(page, 'PATCH', memberRow('ryan', 7), { density: 'comfortable' });
  }
});

test('rule 8: Mẹ edits a seeded expense to 1tr2 under Bảo trì, and the audit log names her', async ({ page }) => {
  const seeded = seedId('seed:expense:lane-8:q7:2026-05:1');
  await open(page, 'me.lane8@demo.esta.test', 'light', PHONE);
  try {
    await page.goto(`/properties/${q7(8)}/finance`);
    const row = page.locator(`[data-expense-id="${seeded}"]`);
    await row.getByTestId('expense-row-edit').click();
    await expect(sheet(page).getByRole('textbox', { name: 'Số tiền' })).toHaveValue('950.000');
    await typeAmount(page, '1tr2');
    await pick(page, 'Bảo trì');
    await sheet(page).getByTestId('expense-save').click();
    await expect(toast(page)).toContainText(`Đã lưu chi phí ${vnd('1.200.000')}.`);
    await expect(row.getByTestId('expense-amount')).toHaveText(vnd('1.200.000'));
    await expect(row.getByTestId('expense-category')).toHaveText('Bảo trì');
    await shot(page, 'edit', row);
    const [me] = await rest<{ user_id: string }[]>(page, 'GET', `${memberRow('me', 8)}&select=user_id`);
    const audit = await rest<{ actor_kind: string; actor_id: string }[]>(page, 'GET', `audit_log?table_name=eq.expenses&row_id=eq.${seeded}&action=eq.update&select=actor_kind,actor_id`);
    expect(audit).toContainEqual({ actor_kind: 'user', actor_id: me?.user_id });
  } finally {
    await rest(page, 'PATCH', `expenses?id=eq.${seeded}`, { amount_vnd: 950_000, category: 'repair' });
  }
});

test('rule 9: offline, Lưu keeps every value and says it did not save, and no row is written', async ({ page }) => {
  await open(page, 'ryan.lane9@demo.esta.test', 'light', DESKTOP);
  const before = await liveExpenses(page, 9);
  await page.goto(`/properties/${q7(9)}/finance`);
  await page.getByTestId('expense-section').getByTestId('add-expense').click();
  await typeAmount(page, '2tr5');
  await pick(page, 'Sửa chữa');
  await sheet(page).getByTestId('expense-note').fill('Thay vòi nước');
  await page.context().setOffline(true);
  await sheet(page).getByTestId('expense-save').click();
  await expect(sheet(page).getByTestId('expense-error')).toHaveText('Chưa lưu được. Kiểm tra kết nối mạng rồi thử lại.');
  await expect(sheet(page).getByRole('textbox', { name: 'Số tiền' })).toHaveValue('2tr5');
  await expect(sheet(page).getByRole('radio', { name: 'Sửa chữa' })).toBeChecked();
  await expect(sheet(page).getByTestId('expense-note')).toHaveValue('Thay vòi nước');
  await shot(page, 'offline');
  await page.context().setOffline(false);
  expect(await liveExpenses(page, 9)).toEqual(before);
});

test('rule 10: in English at 130% and dark, Phòng 5 is 12 days overdue and the sheet and the saved row read in English', async ({ page }) => {
  await open(page, 'me.lane10@demo.esta.test', 'dark', PHONE);
  await rest(page, 'PATCH', memberRow('me', 10), { locale: 'en', text_scale: 130 });
  try {
    await page.goto('/collections');
    await expect(page.getByTestId('collections-row').filter({ hasText: 'Phòng 5, Dãy trọ Dĩ An' }).locator('[data-status="overdue"]')).toHaveText('12 days overdue');
    await page.goto(`/properties/${q7(10)}`);
    await page.getByTestId('add-expense').click();
    await expect(sheet(page).getByRole('heading', { name: 'Add expense' })).toBeVisible();
    await typeAmount(page, '2tr5');
    await pick(page, 'Repair');
    await expect(sheet(page).getByTestId('expense-date')).toHaveText('Today, 07/10/2026');
    expect(await settledAxe(page)).toEqual([]);
    await sheet(page).getByTestId('expense-save').click();
    await expect(toast(page)).toContainText(`Expense of ${vnd('2,500,000')} recorded.`);
    await page.getByRole('navigation', { name: 'Property sections' }).getByRole('link', { name: 'Money' }).click();
    await expect(page.getByRole('heading', { name: 'Expenses in 2026' })).toBeVisible();
    await expect(rows(page).first().getByTestId('expense-category')).toHaveText('Repair');
    const cut = await rows(page).locator('span').evaluateAll((elements) => elements.filter((element) => element.scrollWidth > element.clientWidth + 1).map((element) => element.textContent));
    expect(cut).toEqual([]);
    expect(await noSidewaysScroll(page)).toBe(true);
    await shot(page, 'en-130-dark', page.getByTestId('expense-section'));
  } finally {
    await rest(page, 'PATCH', memberRow('me', 10), { locale: 'vi', text_scale: 100 });
  }
});

test('a viewer reads Thu chi with no expense action', async ({ page }) => {
  await open(page, 'me.lane3@demo.esta.test', 'light', PHONE);
  const invited = 'viewer.lane3@demo.esta.test';
  const existing = await rest<unknown[]>(page, 'GET', `household_members?invited_email=eq.${invited}&select=id`);
  if (existing.length === 0) await rest(page, 'POST', 'household_members', { household_id: seedId('seed:household:lane-3'), invited_email: invited, role: 'viewer' });
  await page.context().clearCookies();
  await open(page, invited, 'light', PHONE);
  await page.goto(`/properties/${q7(3)}`);
  await expect(page.getByTestId('property-header')).toBeVisible();
  await expect(page.getByTestId('add-expense')).toHaveCount(0);
  await page.goto(`/properties/${q7(3)}/finance`);
  await expect(rows(page).first()).toBeVisible();
  await expect(page.getByTestId('add-expense')).toHaveCount(0);
  await expect(page.getByTestId('receipt-camera')).toHaveCount(0);
  await expect(page.getByTestId('expense-row-edit')).toHaveCount(0);
});

test('screens: Thu chi, the sheet and the empty year at 390 and 1440, light and dark', async ({ page }) => {
  test.skip(shots === undefined, 'evidence only: set ESTA_E2E_SHOTS');
  const longAn = seedId('seed:property:lane-1:long-an');
  for (const [size, viewport] of [['390', PHONE], ['1440', DESKTOP]] as const) {
    for (const theme of ['light', 'dark'] as const) {
      await page.context().clearCookies();
      await open(page, 'me.lane1@demo.esta.test', theme, viewport);
      await page.goto(`/properties/${q7(1)}`);
      await expect(page.getByTestId('add-expense')).toBeEnabled();
      await shot(page, `actions-${size}-${theme}`, page.getByTestId('add-expense'));
      await page.goto(`/properties/${q7(1)}/finance`);
      await expect(page.getByTestId('expense-section').getByTestId('add-expense')).toBeEnabled();
      await shot(page, `thu-chi-${size}-${theme}`, page.getByTestId('expense-section'));
      await page.getByTestId('expense-section').getByTestId('add-expense').click();
      await expect(sheet(page)).toBeVisible();
      await shot(page, `sheet-${size}-${theme}`);
      await page.goto(`/properties/${longAn}/finance`);
      await expect(page.getByTestId('expense-empty')).toBeVisible();
      await shot(page, `empty-${size}-${theme}`, page.getByTestId('expense-empty'));
    }
  }
});
