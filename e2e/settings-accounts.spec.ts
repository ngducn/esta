import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';
import { query } from '../scripts/db-checksum.ts';
import { decodeQrPng } from '../scripts/decode-qr.ts';
import { parseSlot, slotWorkdir } from '../scripts/slot.ts';
import { seedId } from '../supabase/seed/generator/ids.ts';
import { memberRest } from './helpers/auth-api';
import { laneHousehold } from './helpers/seed';
import { noSidewaysScroll, open, PHONE, seriousAxeViolations } from './helpers/wizard';

const workdir = slotWorkdir(join(import.meta.dirname, '..'), parseSlot(process.env.ESTA_SLOT));
const HOUSEHOLD = laneHousehold(7);
const SEEDED = seedId('seed:bank-account:lane-7');
const MB = { bin: '970422', typedNo: '0071 000 123 456', accountNo: '0071000123456' } as const;

test.beforeEach(() => {
  test.skip(test.info().project.name !== 'mobile', 'one lane household, so one viewport');
});

test.afterEach(() => {
  query(workdir, `update public.bank_accounts set is_default = false where household_id = '${HOUSEHOLD}' and id <> '${SEEDED}' returning id`);
  query(workdir, `update public.bank_accounts set is_default = true where id = '${SEEDED}' returning id`);
  query(workdir, `delete from public.bank_accounts where household_id = '${HOUSEHOLD}' and id <> '${SEEDED}' returning id`);
});

const section = (page: Page) => page.getByTestId('receiving-accounts');
const rows = (page: Page) => section(page).getByTestId('receiving-account');
const row = (page: Page, accountNo: string) => rows(page).filter({ has: page.getByTestId('account-number').getByText(accountNo, { exact: true }) });
const defaults = () => query<{ account_no: string }>(workdir, `select account_no from public.bank_accounts where household_id = '${HOUSEHOLD}' and is_default`);

async function addMb(page: Page) {
  await section(page).getByTestId('add-account').click();
  const sheet = page.getByTestId('account-sheet');
  await expect(sheet.getByRole('heading', { name: 'Tài khoản nhận tiền' })).toBeVisible();
  await expect(sheet).toContainText('Tài khoản mới chưa là mặc định.');
  await sheet.getByTestId('account-bank').selectOption(MB.bin);
  await sheet.getByTestId('account-no').fill(MB.typedNo);
  await sheet.getByTestId('account-name').fill('Trần Minh  Demo');
  await expect(sheet.getByTestId('account-name-preview')).toHaveText('TRAN MINH DEMO');
  return sheet;
}

test('Ryan adds an MB account, scans its sample QR, and Đặt làm mặc định makes it the one default (PLT-1)', async ({ page }) => {
  await open(page, 'ryan.lane7@demo.esta.test', 'light', PHONE);
  await page.goto('/settings');
  await expect(rows(page)).toHaveCount(1);
  await expect(row(page, '0123456789').getByTestId('account-default')).toHaveText('Mặc định');
  await expect(row(page, '0123456789').getByTestId('remove-account')).toHaveCount(0);

  const sheet = await addMb(page);
  expect(await noSidewaysScroll(page)).toBe(true);
  expect(await seriousAxeViolations(page)).toEqual([]);
  await sheet.getByTestId('account-save').click();
  await expect(sheet).toBeHidden();
  const mb = row(page, MB.accountNo);
  await expect(mb.getByRole('heading')).toHaveText('MB');
  await expect(mb.getByTestId('account-holder')).toHaveText('TRAN MINH DEMO');
  await expect(mb.getByTestId('account-default')).toHaveCount(0);

  await mb.getByTestId('row-action-qr').click();
  const qr = page.getByTestId('qr-sheet');
  await expect(qr.getByRole('heading', { name: 'Mã QR mẫu của MB' })).toBeVisible();
  await expect(qr.getByTestId('qr-account-name')).toHaveText('TRAN MINH DEMO');
  await expect(qr.getByTestId('qr-open-invoice')).toHaveCount(0);
  const scanned = decodeQrPng(await qr.getByTestId('qr-code').screenshot());
  expect(scanned?.decoded).toEqual({
    ok: true,
    value: { initiation: 'dynamic', bin: MB.bin, accountNo: MB.accountNo, service: 'QRIBFTTA', amountVnd: 10_000, purpose: 'ESTA TAIKHOAN' },
  });
  await qr.getByRole('button', { name: 'Đóng' }).click();
  await expect(qr).toBeHidden();

  await mb.getByTestId('make-default').click();
  await expect(rows(page).first()).toHaveAttribute('data-default', 'true');
  await expect(rows(page).first().getByTestId('account-number')).toHaveText(MB.accountNo);
  expect(defaults()).toEqual([{ account_no: MB.accountNo }]);
  expect(await seriousAxeViolations(page)).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('settings-accounts-390-light.png'), fullPage: true });
});

test('removing an account asks first and names it, and Giữ lại keeps it', async ({ page }) => {
  await open(page, 'me.lane7@demo.esta.test', 'dark', PHONE);
  await page.goto('/settings');
  const sheet = await addMb(page);
  await sheet.getByTestId('account-save').click();
  await expect(sheet).toBeHidden();

  const confirm = page.getByRole('alertdialog', { name: 'Xóa tài khoản MB 0071000123456?' });
  await row(page, MB.accountNo).getByTestId('remove-account').click();
  await confirm.getByRole('button', { name: 'Giữ lại' }).click();
  await expect(confirm).toBeHidden();
  await expect(rows(page)).toHaveCount(2);

  await row(page, MB.accountNo).getByTestId('remove-account').click();
  await confirm.getByRole('button', { name: 'Xóa tài khoản' }).click();
  await expect(rows(page)).toHaveCount(1);
  expect(query(workdir, `select count(*)::int as n from public.bank_accounts where household_id = '${HOUSEHOLD}'`)).toEqual([{ n: 1 }]);
  expect(defaults()).toEqual([{ account_no: '0123456789' }]);
});

test('a viewer sees the accounts and their sample QR, with nothing to change', async ({ page }) => {
  await open(page, 'me.lane7@demo.esta.test', 'light', PHONE);
  const invited = 'viewer.lane7@demo.esta.test';
  const existing = await memberRest<unknown[]>(page, 'GET', `household_members?invited_email=eq.${invited}&select=id`);
  if (existing.length === 0) await memberRest(page, 'POST', 'household_members', { household_id: HOUSEHOLD, invited_email: invited, role: 'viewer' });
  await page.context().clearCookies();
  await open(page, invited, 'light', PHONE);
  await page.goto('/settings');
  await expect(section(page)).toContainText('Chỉ quản trị viên thay đổi được các tài khoản này.');
  await expect(row(page, '0123456789').getByTestId('row-action-qr')).toBeVisible();
  for (const testId of ['add-account', 'edit-account', 'make-default', 'remove-account']) await expect(section(page).getByTestId(testId)).toHaveCount(0);
});
