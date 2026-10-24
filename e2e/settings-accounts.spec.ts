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
const SECOND = { typedNo: '0072 000 123 456', accountNo: '0072000123456' } as const;

test.beforeEach(() => {
  test.skip(test.info().project.name !== 'mobile', 'one lane household, so one viewport');
});

test.afterEach(() => {
  query(workdir, `delete from public.payments where household_id = '${HOUSEHOLD}' and bank_account_id <> '${SEEDED}' returning id`);
  query(workdir, `update public.bank_accounts set is_default = false where household_id = '${HOUSEHOLD}' and id <> '${SEEDED}' returning id`);
  query(workdir, `update public.bank_accounts set is_default = true where id = '${SEEDED}' returning id`);
  query(workdir, `delete from public.bank_accounts where household_id = '${HOUSEHOLD}' and id <> '${SEEDED}' returning id`);
});

const section = (page: Page) => page.getByTestId('receiving-accounts');
const rows = (page: Page) => section(page).getByTestId('receiving-account');
const row = (page: Page, accountNo: string) => rows(page).filter({ has: page.getByTestId('account-number').getByText(accountNo, { exact: true }) });
const defaults = () => query<{ account_no: string }>(workdir, `select account_no from public.bank_accounts where household_id = '${HOUSEHOLD}' and is_default`);

async function openAdd(page: Page) {
  await section(page).getByTestId('add-account').click();
  const sheet = page.getByTestId('account-sheet');
  await expect(sheet.getByRole('heading', { name: 'Tài khoản nhận tiền' })).toBeVisible();
  await expect(sheet).toContainText('Tài khoản mới chưa là mặc định.');
  for (const field of ['account-bank', 'account-no', 'account-name']) await expect(sheet.getByTestId(field), `${field} starts empty`).toHaveValue('');
  return sheet;
}

async function addMb(page: Page, typedNo: string = MB.typedNo) {
  const sheet = await openAdd(page);
  await sheet.getByTestId('account-bank').selectOption(MB.bin);
  await sheet.getByTestId('account-no').fill(typedNo);
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
  await expect(qr.getByTestId('qr-save'), 'a sample pays no bill, so it has no picture to save').toHaveCount(0);
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
  await expect(confirm).toContainText('Tài khoản sẽ không còn trong danh sách. Hóa đơn và tiền đã ghi không thay đổi.');
  await confirm.getByRole('button', { name: 'Giữ lại' }).click();
  await expect(confirm).toBeHidden();
  await expect(rows(page)).toHaveCount(2);

  await row(page, MB.accountNo).getByTestId('remove-account').click();
  await confirm.getByRole('button', { name: 'Xóa tài khoản' }).click();
  await expect(rows(page)).toHaveCount(1);
  expect(query(workdir, `select count(*)::int as n from public.bank_accounts where household_id = '${HOUSEHOLD}'`)).toEqual([{ n: 1 }]);
  expect(defaults()).toEqual([{ account_no: '0123456789' }]);
});

test('two accounts added back to back both land, and each edit starts from the stored account', async ({ page }) => {
  await open(page, 'me.lane7@demo.esta.test', 'light', PHONE);
  await page.goto('/settings');
  const first = await addMb(page);
  await first.getByTestId('account-save').click();
  await expect(first).toBeHidden();
  await expect(row(page, MB.accountNo)).toHaveCount(1);

  const second = await addMb(page, SECOND.typedNo);
  await page.screenshot({ path: test.info().outputPath('account-sheet-second-add-390-light.png') });
  await second.getByTestId('account-save').click();
  await expect(second).toBeHidden();
  await expect(rows(page)).toHaveCount(3);
  await expect(row(page, SECOND.accountNo)).toHaveCount(1);
  expect(query(workdir, `select count(*)::int as n from public.bank_accounts where household_id = '${HOUSEHOLD}'`)).toEqual([{ n: 3 }]);

  const edit = page.getByTestId('account-sheet');
  await row(page, SECOND.accountNo).getByTestId('edit-account').click();
  await expect(edit.getByRole('heading', { name: 'Sửa tài khoản nhận tiền' })).toBeVisible();
  await edit.getByTestId('account-name').fill('Lê Văn Demo');
  await edit.getByRole('button', { name: 'Đóng' }).click();
  await expect(edit).toBeHidden();
  await row(page, SECOND.accountNo).getByTestId('edit-account').click();
  await expect(edit.getByTestId('account-name'), 'a cancelled edit is forgotten').toHaveValue('TRAN MINH DEMO');
  await edit.getByTestId('account-name').fill('Lê Văn Demo');
  await edit.getByTestId('account-save').click();
  await expect(edit).toBeHidden();
  await expect(row(page, SECOND.accountNo).getByTestId('account-holder')).toHaveText('LE VAN DEMO');
});

test('once money lands in an account its number stays, and the sheet says to add a new account instead', async ({ page }) => {
  await open(page, 'me.lane7@demo.esta.test', 'light', PHONE);
  await page.goto('/settings');
  const sheet = await addMb(page);
  await sheet.getByTestId('account-save').click();
  await expect(sheet).toBeHidden();
  query(workdir, `insert into public.payments (household_id, amount_vnd, received_on, method, bank_account_id)
    select household_id, 3000000, '2026-10-05', 'bank_transfer', id from public.bank_accounts where household_id = '${HOUSEHOLD}' and account_no = '${MB.accountNo}' returning id`);

  await row(page, MB.accountNo).getByTestId('edit-account').click();
  await sheet.getByTestId('account-no').fill(SECOND.typedNo);
  await sheet.getByTestId('account-save').click();
  await expect(sheet.getByTestId('account-error')).toHaveText(
    'Đã có tiền ghi nhận vào tài khoản này, nên không đổi được ngân hàng hay số tài khoản. Bạn vẫn sửa được tên chủ tài khoản. Muốn nhận tiền vào số khác, hãy thêm tài khoản mới.',
  );
  await sheet.getByTestId('account-no').fill(MB.typedNo);
  await sheet.getByTestId('account-name').fill('Trần Minh Hải Demo');
  await sheet.getByTestId('account-save').click();
  await expect(sheet).toBeHidden();
  await expect(row(page, MB.accountNo).getByTestId('account-holder')).toHaveText('TRAN MINH HAI DEMO');
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
