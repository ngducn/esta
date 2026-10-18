import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import * as mail from '../scripts/inbucket-code.ts';
import { parseSlot } from '../scripts/slot.ts';
import { authApi } from './helpers/auth-api';
import { ageSessions, markCodeJustSent } from './helpers/auth-db';
import { clearMail, latestCode, latestMail, signIn } from './helpers/inbucket';
import { createAccount, DEMO_PASSWORD, signInWithPassword } from './helpers/password';
import { accessToken } from './helpers/session';

const WRONG_PASSWORD = 'Email hoặc mật khẩu chưa đúng. Kiểm tra lại rồi thử lại.';
const SHORT_PASSWORD = 'Mật khẩu cần ít nhất 8 ký tự.';
/** Lane 9's operator. These tests never sign it out or reset it, which would end other specs' sessions or password. */
const MEMBER = 'ryan.lane9@demo.esta.test';
/** Auth refuses a second send to one address within its 1 s max_frequency. */
const SEND_SPACING_MS = 1_200;

function uniqueEmail(prefix: string): string {
  return `${prefix}.${randomUUID().slice(0, 8)}@demo.esta.test`;
}

async function seriousAxeViolations(page: Page): Promise<string[]> {
  await expect(page, 'Next streams the title in after the body on a client navigation').not.toHaveTitle('');
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id);
}

async function sessionCookies(page: Page) {
  return (await page.context().cookies()).filter((cookie) => cookie.name.startsWith('sb-'));
}

function expectNoLink(message: mail.Mail) {
  expect(`${message.Text}\n${message.HTML}`, 'the code email carries no link, so a phone never opens localhost').not.toMatch(
    /https?:\/\/|href=/i,
  );
}

test('FND-1: a new email creates an account with a password, confirms it by code, then signs in with the password', async ({ page }) => {
  const email = uniqueEmail('password');
  const password = `mật khẩu ${randomUUID().slice(0, 6)}`;
  await clearMail(email);
  await page.goto('/sign-in');
  await page.getByRole('link', { name: 'Tạo tài khoản' }).click();
  await expect(page).toHaveURL(/\/sign-up$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tạo tài khoản');
  await expect(page.getByLabel('Email')).toHaveAttribute('autocomplete', 'email');
  await expect(page.getByLabel('Mật khẩu', { exact: true })).toHaveAttribute('autocomplete', 'new-password');
  expect(await seriousAxeViolations(page)).toEqual([]);

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
  await expect(page.getByLabel('Mã 6 chữ số')).toBeFocused();
  await expect(page.locator('#code-sent')).toContainText(email);
  expect(await sessionCookies(page), 'an account is not signed in before its email is confirmed').toEqual([]);
  expect(await seriousAxeViolations(page)).toEqual([]);

  const message = await latestMail(email);
  expect(message.Subject).toBe('Mã đăng nhập Esta');
  expectNoLink(message);
  await page.getByLabel('Mã 6 chữ số').fill(mail.codeFromText(message.Text, email));
  await page.getByRole('button', { name: 'Xác nhận email' }).click();
  await expect(page).toHaveURL(/\/onboarding$/);

  await page.getByLabel('Tên gia đình').fill('Gia đình Mật Khẩu Demo');
  await page.getByLabel('Tên của bạn').fill('Demo Mật Khẩu');
  await page.getByRole('button', { name: 'Tạo gia đình' }).click();
  await page.getByRole('link', { name: 'Xong' }).click();
  await page.getByRole('button', { name: 'Tài khoản' }).click();
  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await expect(page).toHaveURL(/\/sign-in$/);

  await signInWithPassword(page, email.toUpperCase(), password.normalize('NFD'));
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Gia đình Mật Khẩu Demo');

  await page.getByRole('button', { name: 'Tài khoản' }).click();
  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto('/');
  await expect(page, 'sign-out ends the password session').toHaveURL(/\/sign-in$/);
  expect(await sessionCookies(page)).toEqual([]);
});

test('creating an account refuses a password under 8 characters and keeps what was typed', async ({ page }) => {
  const email = uniqueEmail('short');
  await page.goto('/sign-up');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill('1234567');
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toHaveText(SHORT_PASSWORD);
  await expect(page.getByLabel('Mật khẩu', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel('Mật khẩu', { exact: true })).toBeFocused();
  await expect(page.getByLabel('Mật khẩu', { exact: true })).toHaveValue('1234567');
  await expect(page.getByLabel('Email')).toHaveValue(email);
  await expect(page.getByLabel('Mã 6 chữ số')).toHaveCount(0);
});

test('a wrong password gets one plain error, whether or not the email has an account', async ({ page }) => {
  for (const email of [MEMBER, uniqueEmail('nobody')]) {
    await page.goto('/sign-in');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Mật khẩu', { exact: true }).fill('not-the-password');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await expect(page.getByRole('main').getByRole('alert')).toHaveText(WRONG_PASSWORD);
    await expect(page.getByLabel('Mật khẩu', { exact: true }), 'the password is cleared to type again').toHaveValue('');
    await expect(page.getByLabel('Mật khẩu', { exact: true })).toBeFocused();
    await expect(page.getByLabel('Email')).toHaveValue(email);
    await expect(page).toHaveURL(/\/sign-in$/);
    expect(await sessionCookies(page)).toEqual([]);
  }
  expect(await seriousAxeViolations(page)).toEqual([]);
});

test('an empty password gets app copy, not the browser bubble', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(MEMBER);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toHaveText('Nhập mật khẩu.');
  await expect(page.getByLabel('Mật khẩu', { exact: true })).toHaveAttribute('aria-invalid', 'true');
});

test('the show-password toggle reveals the password and hides it again', async ({ page }) => {
  await page.goto('/sign-in');
  const password = page.getByLabel('Mật khẩu', { exact: true });
  await password.fill('Demo-hidden-1');
  await page.getByRole('button', { name: 'Hiện mật khẩu' }).click();
  await expect(password).toHaveAttribute('type', 'text');
  await expect(password).toHaveValue('Demo-hidden-1');
  await page.getByRole('button', { name: 'Ẩn mật khẩu' }).click();
  await expect(password).toHaveAttribute('type', 'password');
});

test('a seeded member signs in with the demo password and keeps a 30-day httpOnly session', async ({ page }) => {
  await signInWithPassword(page, MEMBER, DEMO_PASSWORD);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Gia đình Demo 9');
  const auth = await sessionCookies(page);
  expect(auth.length).toBeGreaterThan(0);
  expect(auth.every((cookie) => cookie.httpOnly)).toBe(true);
  const days = (auth[0]?.expires ?? 0) / 86_400 - (await page.evaluate(() => Date.now())) / 86_400_000;
  expect(days).toBeGreaterThan(29);
  expect(days).toBeLessThanOrEqual(30);

  for (const path of ['/sign-in', '/sign-in/code', '/sign-up', '/forgot-password']) {
    await page.goto(path);
    await expect(page, `a signed-in visitor skips ${path}`).toHaveURL(/\/$/);
  }
});

test('a forgotten password is reset through the emailed code', async ({ page, request }) => {
  const email = uniqueEmail('reset');
  const oldPassword = `Demo-old-${randomUUID().slice(0, 6)}`;
  const newPassword = `Demo-new-${randomUUID().slice(0, 6)}`;
  await createAccount(page, email, oldPassword);
  await page.context().clearCookies();
  await setTimeout(SEND_SPACING_MS);
  await clearMail(email);

  await page.goto('/sign-in');
  await page.getByRole('link', { name: 'Quên mật khẩu?' }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Đặt lại mật khẩu');
  expect(await seriousAxeViolations(page)).toEqual([]);
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Gửi mã' }).click();
  await expect(page.locator('#code-sent')).toContainText(email);
  await expect(page.getByLabel('Mật khẩu mới')).toHaveAttribute('autocomplete', 'new-password');
  expect(await seriousAxeViolations(page)).toEqual([]);

  const message = await latestMail(email);
  expect(message.Subject).toBe('Mã đặt lại mật khẩu Esta');
  expectNoLink(message);
  await page.getByLabel('Mã 6 chữ số').fill(mail.codeFromText(message.Text, email));
  await page.getByLabel('Mật khẩu mới').fill('1234567');
  await page.getByRole('button', { name: 'Đổi mật khẩu' }).click();
  await expect(page.getByRole('main').getByRole('alert').filter({ hasText: /\S/ })).toHaveText(SHORT_PASSWORD);
  await expect(page.getByLabel('Mật khẩu mới')).toBeFocused();

  await page.getByLabel('Mật khẩu mới').fill(newPassword);
  await page.getByRole('button', { name: 'Đổi mật khẩu' }).click();
  await expect(page.getByRole('heading', { name: 'Đã đổi mật khẩu' }), 'a short password does not use up the code').toBeVisible();
  expect(await seriousAxeViolations(page)).toEqual([]);
  await page.getByRole('link', { name: 'Vào Esta' }).click();
  await expect(page).toHaveURL(/\/onboarding$/);

  const grant = (password: string) =>
    request.post(`${authApi.url}/token?grant_type=password`, { headers: authApi.headers, data: { email, password } });
  expect((await grant(oldPassword)).status(), 'the old password no longer signs in').toBe(400);
  expect((await grant(newPassword)).status(), 'the new password signs in').toBe(200);
});

test('a reset for an address with no account looks the same and sends no mail', async ({ page }) => {
  const email = uniqueEmail('noaccount');
  await clearMail(email);
  await page.goto('/forgot-password');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Gửi mã' }).click();
  await expect(page.locator('#code-sent')).toContainText(`Nếu ${email} có tài khoản Esta`);
  const mailbox = { ...mail.slotMailbox(parseSlot(process.env.ESTA_SLOT)), timeoutMs: 3_000 };
  await expect(mail.latestMail(email, mailbox)).rejects.toThrow(/No mail reached/);
});

test('a wrong reset code changes nothing', async ({ page, request }) => {
  const email = uniqueEmail('wrongreset');
  const password = `Demo-keep-${randomUUID().slice(0, 6)}`;
  await createAccount(page, email, password);
  await page.context().clearCookies();
  await setTimeout(SEND_SPACING_MS);
  await clearMail(email);
  await page.goto('/forgot-password');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Gửi mã' }).click();
  const code = await latestCode(email);
  await page.getByLabel('Mã 6 chữ số').fill(code === '000000' ? '111111' : '000000');
  await page.getByLabel('Mật khẩu mới').fill('Demo-attempt-2');
  await page.getByRole('button', { name: 'Đổi mật khẩu' }).click();
  await expect(page.getByRole('main').getByRole('alert').filter({ hasText: /\S/ })).toHaveText('Mã không đúng hoặc đã hết hạn. Gửi lại mã.');
  expect(await sessionCookies(page)).toEqual([]);
  const grant = await request.post(`${authApi.url}/token?grant_type=password`, { headers: authApi.headers, data: { email, password } });
  expect(grant.status(), 'the password stays as it was').toBe(200);
});

test('a session older than a day cannot set a password without a new code, so signing out everywhere ends it', async ({ page, request }) => {
  const email = uniqueEmail('oldsession');
  const password = `Demo-later-${randomUUID().slice(0, 6)}`;
  await signIn(page, email);
  const bearer = { ...authApi.headers, authorization: `Bearer ${await accessToken(page)}` };
  expect(ageSessions(email), 'the code sign-in left one session').toBe(1);

  const update = await request.put(`${authApi.url}/user`, { headers: bearer, data: { password } });
  expect(update.status(), 'a day-old session cannot set a password').toBe(400);
  expect(((await update.json()) as { error_code?: string }).error_code).toBe('reauthentication_needed');

  expect((await request.post(`${authApi.url}/logout?scope=global`, { headers: bearer })).status()).toBe(204);
  const grant = await request.post(`${authApi.url}/token?grant_type=password`, { headers: authApi.headers, data: { email, password } });
  expect(grant.status(), 'after signing out everywhere, nothing from the old session signs in').toBe(400);
});

type SendPage = '/forgot-password' | '/sign-up';

async function sendFrom(page: Page, path: SendPage, email: string): Promise<void> {
  await page.goto(path);
  await page.getByLabel('Email').fill(email);
  if (path === '/sign-up') await page.getByLabel('Mật khẩu', { exact: true }).fill('Demo-repeat-1');
  await page.locator('button[value="send"]').click();
}

async function resend(page: Page): Promise<void> {
  await page.clock.runFor('01:01');
  await page.getByRole('button', { name: 'Gửi lại mã', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Gửi lại mã sau/ }), 'the countdown restarts, as after any send').toBeVisible();
}

/** The code step as a visitor reads it, with the address taken out so two addresses compare. */
async function codeStepSeen(page: Page, email: string): Promise<string[]> {
  await expect(page.getByLabel('Mã 6 chữ số'), 'the code step shows').toBeVisible();
  const alerts = (await page.getByRole('main').getByRole('alert').allInnerTexts()).filter((text) => text.trim() !== '');
  return [await page.locator('#code-sent').innerText(), ...alerts].map((text) => text.replaceAll(email, '<email>'));
}

/** Each send twice in quick succession, reset first, as someone probing an address would. */
async function probe(page: Page, email: string): Promise<string[][]> {
  const seen: string[][] = [];
  for (const path of ['/forgot-password', '/sign-up'] as const) {
    await sendFrom(page, path, email);
    seen.push(await codeStepSeen(page, email));
    markCodeJustSent(email);
    await resend(page);
    seen.push(await codeStepSeen(page, email));
    await sendFrom(page, path, email);
    seen.push(await codeStepSeen(page, email));
  }
  return seen;
}

test('quick repeat code requests look the same whether or not the address has an account', async ({ page }) => {
  const known = uniqueEmail('repeat');
  await createAccount(page, known, `Demo-repeat-${randomUUID().slice(0, 6)}`);
  await page.context().clearCookies();
  await setTimeout(SEND_SPACING_MS);
  await page.clock.install();

  const seenKnown = await probe(page, known);
  const seenNobody = await probe(page, uniqueEmail('repeat.nobody'));
  expect(seenKnown).toEqual(seenNobody);
  expect(seenKnown.filter((step) => step.length > 1), 'no step shows an error').toEqual([]);
});
