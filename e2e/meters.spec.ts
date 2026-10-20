import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';
import { query } from '../scripts/db-checksum.ts';
import { parseSlot, slotWorkdir } from '../scripts/slot.ts';
import { seedId } from '../supabase/seed/generator/ids.ts';
import { PRICE_VND, SEPTEMBER } from '../supabase/seed/generator/meters.ts';
import { inEnglishAt130, memberRest } from './helpers/auth-api';
import { laneHousehold, laneLease, laneProperty } from './helpers/seed';
import { setClock } from './helpers/test-clock';
import { DESKTOP, noSidewaysScroll, open, PHONE, recordForPr, seriousAxeViolations, START, toast } from './helpers/wizard';

const workdir = slotWorkdir(join(import.meta.dirname, '..'), parseSlot(process.env.ESTA_SLOT));
const metersPath = (lane: number) => `/properties/${laneProperty(lane, 'di-an')}/rental/meters`;
const holdForRecording = recordForPr();

// Readings default to the month before the Clock's, and bills issue on the database clock, so the spec runs in the
// `clock` project. Each rule reads or writes its own lane's Dĩ An.
test.beforeEach(async ({ request }) => {
  await setClock(request, START);
});

const room = (page: Page, n: number) => page.getByTestId('meter-room').filter({ has: page.getByRole('heading', { name: `Phòng ${n}`, exact: true }) });
const reading = (page: Page, n: number, kind: 'electricity' | 'water') => room(page, n).locator(`[data-kind="${kind}"]`);

/** October as each room's September reading plus a month's use: 100 + 10n kWh and 4 + n m³. */
const october = (n: number) => ({ electricity: (SEPTEMBER.electricity[n - 1] ?? 0) + 100 + 10 * n, water: (SEPTEMBER.water[n - 1] ?? 0) + 4 + n });

async function enter(page: Page, rooms: readonly number[], value: (n: number) => { electricity: number; water: number } = october) {
  for (const n of rooms) {
    for (const kind of ['electricity', 'water'] as const) await reading(page, n, kind).getByRole('textbox').fill(String(value(n)[kind]));
  }
}

type Bill = { status: string; lines: { kind: string; quantity: number; amount_vnd: number }[] };

async function billFrom(page: Page, lane: number, n: number, start: string): Promise<Bill | undefined> {
  const [bill] = await memberRest<Bill[]>(page, 'GET', `invoices?lease_id=eq.${laneLease(lane, 'di-an', n)}&period_start=eq.${start}&select=status,lines:invoice_lines(kind,quantity,amount_vnd)`);
  return bill === undefined ? undefined : { ...bill, lines: bill.lines.toSorted((a, b) => a.kind.localeCompare(b.kind)) };
}

test('rule 1: Nhập chỉ số on the Cho thuê tab opens September with every Dĩ An room read on 03/10/2026 (SPEC §9.3)', async ({ page }) => {
  await open(page, 'me.lane1@demo.esta.test', 'light', PHONE);
  await page.goto(`/properties/${laneProperty(1, 'di-an')}/rental`);
  await page.getByTestId('enter-readings').click();
  await expect(page).toHaveURL(metersPath(1));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Chỉ số điện nước');
  await expect(page.getByTestId('meter-month')).toHaveText('Tháng 9/2026');
  await expect(page.getByTestId('meter-remaining')).toHaveText('Đã nhập đủ 8 phòng');
  await expect(page.getByTestId('meter-room')).toHaveCount(8);
  await expect(page.getByTestId('meter-read-on')).toHaveText(Array.from({ length: 8 }, () => 'Nhập ngày 03/10/2026'));
  for (let n = 1; n <= 8; n++) {
    await expect(reading(page, n, 'electricity').getByRole('textbox', { name: `Phòng ${n} Điện, kWh` })).toHaveValue(String(SEPTEMBER.electricity[n - 1]));
    await expect(reading(page, n, 'water').getByRole('textbox', { name: `Phòng ${n} Nước, m³` })).toHaveValue(String(SEPTEMBER.water[n - 1]));
  }
  await expect(reading(page, 1, 'electricity').getByTestId('meter-previous')).toHaveText('Chỉ số đầu tiên');
  await expect(page.getByTestId('meter-price-note')).toContainText('Giả định');
  await holdForRecording(page);
  expect(await seriousAxeViolations(page)).toEqual([]);
  expect(await noSidewaysScroll(page)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('meters-september-390-light.png'), fullPage: true });
});

test('rule 2: at 02/11 Mẹ enters October for four rooms, then the rest, and each room’s bill from 25/11 issues with its electricity and water (LSE-4)', async ({ page }) => {
  test.setTimeout(120_000);
  await setClock(page.request, '2026-11-02T09:00:00+07:00');
  // The nightly job of 02/11 has drafted the bills from 25/11; each waits for its room's October readings.
  query(workdir, `select * from public.run_invoicing('${laneHousehold(7)}', '2026-11-02', '2026-11-02T00:30:00+07:00')`);
  await open(page, 'me.lane7@demo.esta.test', 'light', PHONE);
  await page.goto(metersPath(7));
  await expect(page.getByTestId('meter-month')).toHaveText('Tháng 10/2026');
  await expect(page.getByTestId('meter-remaining')).toHaveText('Còn 8 phòng chưa nhập');
  const keypad = reading(page, 1, 'electricity').getByRole('textbox');
  await expect(keypad).toHaveAttribute('inputmode', 'numeric');
  expect((await reading(page, 1, 'electricity').boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await expect(reading(page, 1, 'electricity').getByTestId('meter-previous')).toHaveText('Tháng 9: 2.847');

  await enter(page, [1, 2, 3, 4]);
  await expect(reading(page, 1, 'electricity').getByTestId('meter-message')).toHaveText('Dùng 110 kWh');
  await expect(reading(page, 1, 'water').getByTestId('meter-message')).toHaveText('Dùng 5 m³');
  await page.getByTestId('meter-save').click();
  await expect(toast(page)).toContainText('Đã lưu chỉ số tháng 10/2026. Đã phát hành 4 hóa đơn.');
  await expect(page.getByTestId('meter-remaining')).toHaveText('Còn 4 phòng chưa nhập');
  await page.screenshot({ path: test.info().outputPath('meters-partial-390-light.png'), fullPage: true });
  expect((await billFrom(page, 7, 1, '2026-11-25'))?.lines).toEqual([
    { kind: 'electricity', quantity: 110, amount_vnd: 110 * PRICE_VND.electricity },
    { kind: 'rent', quantity: 1, amount_vnd: 2_500_000 },
    { kind: 'water', quantity: 5, amount_vnd: 5 * PRICE_VND.water },
  ]);
  for (const n of [1, 2, 3, 4]) expect((await billFrom(page, 7, n, '2026-11-25'))?.status, `Phòng ${n}`).toBe('issued');
  for (const n of [5, 6]) expect((await billFrom(page, 7, n, '2026-11-25'))?.status, `Phòng ${n}`).toBe('draft');

  await enter(page, [5, 6, 7, 8]);
  await reading(page, 8, 'water').getByRole('textbox').press('Enter');
  await expect(toast(page)).toContainText('Đã lưu chỉ số tháng 10/2026. Đã phát hành 2 hóa đơn.');
  await expect(page.getByTestId('meter-remaining')).toHaveText('Đã nhập đủ 8 phòng');
  for (const n of [5, 6]) expect((await billFrom(page, 7, n, '2026-11-25'))?.status, `Phòng ${n}`).toBe('issued');
  const vacant = await memberRest<unknown[]>(page, 'GET', `invoices?lease_id=eq.${laneLease(7, 'di-an', 7)}&period_start=gte.2026-10-01&select=id`);
  expect(vacant, 'Phòng 7, whose lease ended in September, gets no bill for its readings').toEqual([]);
  await holdForRecording(page);
  expect(await seriousAxeViolations(page)).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('meters-complete-390-light.png'), fullPage: true });

  // A reading raised after its bill went out (LSE-4): the bill stays, and the next draft carries the difference.
  const sent = await billFrom(page, 7, 3, '2026-11-25');
  await reading(page, 3, 'electricity').getByRole('textbox').fill(String(october(3).electricity + 10));
  await page.getByTestId('meter-save').click();
  await expect(toast(page)).toContainText('Đã lưu chỉ số tháng 10/2026. Chưa có hóa đơn nào phát hành.');
  expect(await billFrom(page, 7, 3, '2026-11-25')).toEqual(sent);
  await setClock(page.request, '2026-11-26T09:00:00+07:00');
  query(workdir, `select * from public.run_invoicing('${laneHousehold(7)}', '2026-11-26', '2026-11-26T00:30:00+07:00')`);
  expect(await billFrom(page, 7, 3, '2026-12-25')).toEqual({
    status: 'draft',
    lines: [
      { kind: 'adjustment', quantity: 10, amount_vnd: 10 * PRICE_VND.electricity },
      { kind: 'rent', quantity: 1, amount_vnd: 2_500_000 },
    ],
  });

  // A month above three times the usual still saves, with the warning on its row.
  await setClock(page.request, '2026-12-02T09:00:00+07:00');
  await page.goto(metersPath(7));
  await expect(page.getByTestId('meter-month')).toHaveText('Tháng 11/2026');
  await expect(reading(page, 2, 'electricity').getByTestId('meter-previous')).toHaveText('Tháng 10: 4.240');
  await reading(page, 2, 'electricity').getByRole('textbox').fill(String(october(2).electricity + 1200));
  await expect(reading(page, 2, 'electricity').getByTestId('meter-anomaly')).toHaveText('Cao gấp 3 lần mức thường (120 kWh mỗi tháng)');
  await page.screenshot({ path: test.info().outputPath('meters-anomaly-390-light.png') });
  await page.getByTestId('meter-save').click();
  await expect(toast(page)).toContainText('Đã lưu chỉ số tháng 11/2026.');
});

test('rule 3: a Phòng 4 reading below September’s is refused on its row in dark, and Lưu saves nothing', async ({ page }) => {
  await setClock(page.request, '2026-11-02T09:00:00+07:00');
  await open(page, 'me.lane4@demo.esta.test', 'dark', PHONE);
  await page.goto(metersPath(4));
  const row = reading(page, 4, 'electricity');
  await row.getByRole('textbox').fill('3300');
  await expect(row.getByTestId('meter-message')).toHaveText('Thấp hơn chỉ số tháng trước (3.305). Kiểm tra lại.');
  await expect(row.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
  await reading(page, 4, 'water').getByRole('textbox').fill('27,5');
  await expect(reading(page, 4, 'water').getByTestId('meter-message')).toHaveText('Nhập số trên đồng hồ, không có phần lẻ.');
  await page.getByTestId('meter-save').click();
  await expect(page.getByTestId('meter-form')).toContainText('Sửa các chỉ số được đánh dấu rồi lưu lại.');
  await expect(row.getByRole('textbox')).toBeFocused();
  expect(await seriousAxeViolations(page)).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('meters-refused-390-dark.png') });
  const saved = await memberRest<unknown[]>(page, 'GET', `meter_readings?meter_id=eq.${seedId('seed:meter:lane-4:di-an:4:electricity')}&reading_month=eq.2026-10-01&select=id`);
  expect(saved).toEqual([]);
});

test('rule 4: at 1440 all eight rooms with both meters fit one screen without sideways scroll', async ({ page }) => {
  await setClock(page.request, '2026-11-02T09:00:00+07:00');
  await open(page, 'me.lane8@demo.esta.test', 'light', DESKTOP);
  await page.goto(metersPath(8));
  await expect(page.getByTestId('meter-room')).toHaveCount(8);
  const last = await reading(page, 8, 'water').getByRole('textbox').boundingBox();
  expect((last?.y ?? Infinity) + (last?.height ?? 0)).toBeLessThanOrEqual(DESKTOP.height);
  expect(await noSidewaysScroll(page)).toBe(true);
  expect(await seriousAxeViolations(page)).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('meters-1440-light.png') });
});

test('rule 5: in English at 130% text and dark, every row keeps its label, last month and input on screen', async ({ page }) => {
  await open(page, 'me.lane10@demo.esta.test', 'dark', PHONE);
  await inEnglishAt130(page, seedId('seed:member:me-lane-10'), async () => {
    await page.goto(metersPath(10));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Meter readings');
    await expect(page.getByTestId('meter-remaining')).toHaveText('All 8 rooms read');
    for (const row of await page.getByTestId('meter-row').all()) {
      for (const part of [row.locator('label'), row.getByRole('textbox'), row.getByTestId('meter-previous')]) {
        const box = await part.boundingBox();
        expect((box?.x ?? -1) >= 0 && (box?.x ?? 0) + (box?.width ?? Infinity) <= PHONE.width).toBe(true);
      }
    }
    expect(await noSidewaysScroll(page)).toBe(true);
    await page.getByTestId('meter-save').click();
    await expect(toast(page)).toContainText('No reading changed.');
    expect(await seriousAxeViolations(page)).toEqual([]);
    await page.screenshot({ path: test.info().outputPath('meters-english-130-390-dark.png'), fullPage: true });
  });
});
