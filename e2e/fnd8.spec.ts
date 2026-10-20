import { expect, test, type Page } from '@playwright/test';
import { seedId } from '../supabase/seed/generator/ids.ts';
import { memberRest } from './helpers/auth-api';
import { boardRow } from './helpers/board';
import { clippedText } from './helpers/text-scale';
import { setClock } from './helpers/test-clock';
import { noSidewaysScroll, open, PHONE, seriousAxeViolations, shot, START } from './helpers/wizard';

// FND-8 on SPEC §9.3's main Demo household, which only the `clock` project's specs read, one file at a time, so Mẹ's
// 130% text never reaches another spec. Home and the board follow the Clock, so the spec runs on SPEC §9.3's day.
const MOM = 'me@demo.esta.test';
const MEMBER = `household_members?id=eq.${seedId('seed:member:me-demo')}`;
const DI_AN = `/properties/${seedId('seed:property:demo:di-an')}`;

async function expectFits(page: Page, name: string) {
  await expect(page.locator('html')).toHaveAttribute('data-text-scale', '130');
  await shot(page, `p3-17-fnd8-${name}-130-390-light-${await page.locator('html').getAttribute('lang')}`);
  expect(await clippedText(page), 'text cut, spilling or broken inside a word, or a box over another').toEqual([]);
  expect(await noSidewaysScroll(page), 'the page scrolls sideways').toBe(true);
  expect(await seriousAxeViolations(page)).toEqual([]);
}

test('the FND-8 check finds cut, spilling, too-tall and broken text, content wider than its card, visible aria-hidden text, a cut placeholder and overlapping boxes, and passes an ellipsis, a line clamp and strips that scroll', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.setContent(`<main>
    <p data-testid="cut" style="width:50px;overflow:hidden;white-space:nowrap">Đang cho thuê 6/8</p>
    <p data-testid="spill" style="width:50px;white-space:nowrap">Quá hạn 12 ngày</p>
    <p data-testid="tall" style="width:80px;height:20px;line-height:20px">Bảo hiểm cháy nổ Nhà phố Q7</p>
    <p data-testid="word" style="width:60px"><span>Supercalifragilistic</span></p>
    <p data-testid="broken" style="width:60px;overflow-wrap:anywhere">Collections</p>
    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));width:150px">
      <a data-testid="left" style="justify-self:start;white-space:nowrap">‹ September</a><a data-testid="right" style="justify-self:end;white-space:nowrap">November ›</a>
    </div>
    <p data-testid="ellipsis" style="width:50px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">Sổ hồng Bảo Lộc</p>
    <p data-testid="clamp" style="width:80px;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden">Bảo hiểm cháy nổ Nhà phố Q7</p>
    <nav data-testid="strip" style="width:80px;overflow-x:auto;white-space:nowrap">Tổng quan Pháp lý Cho thuê Thu chi</nav>
    <p style="width:120px;overflow-wrap:anywhere">https://esta.example/q/AbCdEfGhIjKlMnOpQrStUv</p>
    <input data-testid="placeholder" style="width:120px" placeholder="Tìm theo tên hoặc chữ trên giấy tờ">
    <input style="width:200px" placeholder="Tên hoặc chữ">
    <div data-testid="bordered" style="width:120px;border:1px solid"><span style="display:inline-block;white-space:nowrap">Quá hạn 12 ngày rất lâu</span></div>
    <div data-testid="card" style="display:flex;gap:8px;width:140px;background:#eee"><span style="white-space:nowrap">Phòng 5, Dãy trọ Dĩ An</span><span style="flex:none;white-space:nowrap">2.800.000 ₫</span></div>
    <div data-testid="pillcard" style="width:120px;padding:4px;border:1px solid"><span style="display:inline-flex;padding:2px 8px;white-space:nowrap;background:#fdd">Quá hạn 12 ngày, từ tháng 9</span></div>
    <p data-testid="ariahidden" aria-hidden="true" style="width:60px;white-space:nowrap">Tháng 10/2026</p>
    <div style="width:200px"><nav style="margin:0 -16px;overflow-x:auto;white-space:nowrap">Tổng quan Pháp lý Cho thuê Thu chi Tài liệu Hoạt động</nav></div>
    <nav style="width:100px;overflow-x:auto"><ul style="display:flex;gap:8px;margin:0;padding:0;list-style:none"><li style="white-space:nowrap">Tổng quan</li><li style="white-space:nowrap">Pháp lý</li><li style="white-space:nowrap">Cho thuê</li></ul></nav>
    <span style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)">Chỉ trình đọc màn hình đọc dòng này</span>
  </main>`);
  const found = await clippedText(page);
  const where = new Set(found.map((hit) => hit.in.replace(/^\[data-testid="([^"]+)"\].*$/, '$1')));
  expect([...where].toSorted()).toEqual(['ariahidden', 'bordered', 'broken', 'card', 'cut', 'left', 'pillcard', 'placeholder', 'spill', 'tall', 'word']);
});

// Mẹ reads Vietnamese and Ryan English, whose longer words are the first to outgrow a box.
for (const [locale, language] of [
  ['vi', 'Vietnamese'],
  ['en', 'English'],
] as const) {
  test.describe(`in ${language} at 130% text and 390 px`, () => {
    test.beforeEach(async ({ page, request }) => {
      await setClock(request, START);
      await open(page, MOM, 'light', PHONE);
      await memberRest(page, 'PATCH', MEMBER, { text_scale: 130, locale });
    });

    test.afterEach(async ({ page }) => {
      await memberRest(page, 'PATCH', MEMBER, { text_scale: 100, locale: 'vi' });
    });

    test('FND-8: Home wraps every item and the collection figure', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByTestId('today-item').first()).toBeVisible();
      await expect(page.getByTestId('month-figure')).toBeVisible();
      await expectFits(page, 'home');
    });

    test('FND-8: the properties list wraps every card, Long An and Dĩ An included', async ({ page }) => {
      await page.goto('/properties');
      await expect(page.getByTestId('property-card')).toHaveCount(7);
      for (const name of ['Đất vườn Long An', 'Dãy trọ Dĩ An']) await expect(page.getByTestId('property-card').filter({ hasText: name })).toBeVisible();
      await expectFits(page, 'properties');
    });

    test('FND-8: the Dĩ An page wraps its header with both addresses', async ({ page }) => {
      await page.goto(DI_AN);
      await expect(page.getByTestId('property-addresses').locator('[data-line="legal"]')).toBeVisible();
      await expect(page.getByTestId('property-addresses').locator('[data-line="current"]')).toBeVisible();
      await expectFits(page, 'property');
    });

    test('FND-8: Thu tiền keeps every row whole, and so do its record payment and reminder sheets', async ({ page }) => {
      await page.goto('/collections');
      const phong5 = boardRow(page, 'overdue', 'Phòng 5, Dãy trọ Dĩ An');
      await expect(phong5).toBeVisible();
      await expectFits(page, 'collections');
      await boardRow(page, 'notDue', 'Phòng 3, Dãy trọ Dĩ An').getByTestId('row-action-record-payment').click();
      await expect(page.getByTestId('record-payment-sheet').getByTestId('payment-save')).toBeVisible();
      await expectFits(page, 'collections-payment');
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('record-payment-sheet')).toBeHidden();
      await phong5.getByTestId('row-action-remind').click();
      await expect(page.getByTestId('reminder-sheet').getByTestId('reminder-copy')).toBeVisible();
      await expectFits(page, 'collections-reminder');
    });

    test('FND-8: Tài liệu cuts nothing in the vault or in the results for bao loc so', async ({ page }) => {
      await page.goto('/documents');
      await expect(page.getByTestId('document-tile').first()).toBeVisible();
      await expectFits(page, 'documents');
      await page.getByTestId('vault-search').fill('bao loc so');
      await expect(page.getByTestId('vault-results').getByTestId('document-link').first()).toHaveText('Sổ hồng Bảo Lộc');
      await expectFits(page, 'documents-search');
    });
  });
}
