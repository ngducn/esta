import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { authApi } from './helpers/auth-api';
import { latestMail, requestCode, signIn } from './helpers/inbucket';

const SLOWER_THAN_AN_ASSERTION_WAITS_MS = 6_000;

async function seriousAxeViolations(page: Page): Promise<string[]> {
  await expect(page, 'Next streams the title in after the body on a client navigation').not.toHaveTitle('');
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id);
}

function uniqueEmail(prefix: string): string {
  return `${prefix}.${randomUUID().slice(0, 8)}@demo.esta.test`;
}

async function createHousehold(page: Page, name: string, displayName: string) {
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByLabel('Tên gia đình').fill(name);
  await page.getByLabel('Tên của bạn').fill(displayName);
  await page.getByRole('button', { name: 'Tạo gia đình' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mời người trong gia đình');
}

test('/ sends a signed-out visitor to /sign-in', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Đăng nhập');
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Gửi mã' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Đăng nhập bằng Google' })).toHaveCount(0);
  expect(await seriousAxeViolations(page)).toEqual([]);
});

test('FND-1: a new email reads its code from Inbucket, signs in and creates a household', async ({ page }) => {
  const email = uniqueEmail('new');
  await signIn(page, email);

  const mail = await latestMail(email);
  expect(mail.Subject).toBe('Mã đăng nhập Esta');
  expect(mail.Text).toContain('Mã đăng nhập Esta của bạn');
  expect(mail.Text).toContain('Your Esta sign-in code');
  expect(`${mail.Text}\n${mail.HTML}`, 'the code email carries no link, so a phone never opens localhost').not.toMatch(
    /https?:\/\/|href=/i,
  );

  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tạo gia đình');
  expect(await seriousAxeViolations(page)).toEqual([]);

  await page.getByRole('button', { name: 'Tạo gia đình' }).click();
  await expect(page.getByText('Nhập tên gia đình.')).toBeVisible();
  await expect(page.getByLabel('Tên gia đình'), 'a blank submit moves focus to the first error').toBeFocused();

  await createHousehold(page, 'Gia đình Mới Demo', 'Demo Mới');
  expect(await seriousAxeViolations(page)).toEqual([]);
  await page.getByRole('link', { name: 'Xong' }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Gia đình Mới Demo');
  await expect(page.getByText('Bạn đang đăng nhập với tên Demo Mới.')).toBeVisible();
  await expect(page.getByText('Quyền: Quản trị')).toBeVisible();
  expect(await seriousAxeViolations(page)).toEqual([]);
});

test('a slow create-household answer keeps the button busy, then opens the invite step', async ({ page }) => {
  test.skip(test.info().project.name !== 'mobile', 'a slow network is a phone concern, so one viewport covers it');
  await signIn(page, uniqueEmail('slow'));
  await page.route('**/onboarding', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const response = await route.fetch();
    await setTimeout(SLOWER_THAN_AN_ASSERTION_WAITS_MS);
    return route.fulfill({ response });
  });

  const created = createHousehold(page, 'Gia đình Chậm Demo', 'Demo Chậm');
  await expect(page.getByRole('button', { name: 'Đang tạo…' }), 'a second tap cannot create a second household').toBeDisabled();
  await created;
});

test('FND-1: an invited email lands in the inviting household with the invited role', async ({ page, browser }) => {
  const household = `Gia đình Mời Demo ${randomUUID().slice(0, 4)}`;
  const invitee = uniqueEmail('invitee');
  await signIn(page, uniqueEmail('admin'));
  await createHousehold(page, household, 'Demo Quản Trị');

  await page.getByLabel('Email người được mời').fill(invitee.toUpperCase());
  await page.getByLabel(/^Chỉ xem/).check();
  await page.getByRole('button', { name: 'Mời', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText(`Đã mời ${invitee} với quyền Chỉ xem.`);

  await page.getByRole('button', { name: 'Mời', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toHaveText('Email chưa đúng. Kiểm tra lại rồi thử lại.');

  const inviteeContext = await browser.newContext();
  const inviteePage = await inviteeContext.newPage();
  await signIn(inviteePage, invitee, (code) => `${code.slice(0, 3)} ${code.slice(3)}`);
  await expect(inviteePage).toHaveURL(/\/$/);
  await expect(inviteePage.getByRole('heading', { level: 1 })).toHaveText(household);
  await expect(inviteePage.getByText('Quyền: Chỉ xem')).toBeVisible();
  await expect(inviteePage.getByRole('link', { name: 'Mời người trong gia đình' })).toHaveCount(0);
  await inviteeContext.close();
});

test('a password signup for an invited address gets no session, and the password never signs in', async ({
  page,
  browser,
  request,
}) => {
  const household = `Gia đình Chiếm Demo ${randomUUID().slice(0, 4)}`;
  const invitee = uniqueEmail('takeover');
  const password = `Demo-${randomUUID()}`;
  await signIn(page, uniqueEmail('admin'));
  await createHousehold(page, household, 'Demo Quản Trị');
  await page.getByLabel('Email người được mời').fill(invitee);
  await page.getByLabel(/^Quản trị/).check();
  await page.getByRole('button', { name: 'Mời', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText(`Đã mời ${invitee} với quyền Quản trị.`);

  const signup = await request.post(`${authApi.url}/signup`, {
    headers: authApi.headers,
    data: { email: invitee.toUpperCase(), password },
  });
  expect(await signup.json(), 'a password signup never yields a session').not.toHaveProperty('access_token');

  const inviteeContext = await browser.newContext();
  const inviteePage = await inviteeContext.newPage();
  await expect(async () => signIn(inviteePage, invitee)).toPass({ timeout: 15_000 });
  await expect(inviteePage.getByRole('heading', { level: 1 })).toHaveText(household);
  await expect(inviteePage.getByText('Quyền: Quản trị')).toBeVisible();
  await inviteeContext.close();

  const grant = await request.post(`${authApi.url}/token?grant_type=password`, {
    headers: authApi.headers,
    data: { email: invitee, password },
  });
  expect(grant.status(), 'the password set before the owner confirmed never signs in').toBe(400);
});

test('a wrong code shows the error and creates no session', async ({ page }) => {
  await requestCode(page, uniqueEmail('wrong'));
  await page.getByLabel('Mã 6 chữ số').fill('000000');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toHaveText('Mã không đúng hoặc đã hết hạn. Gửi lại mã.');
  await expect(page.getByLabel('Mã 6 chữ số'), 'the typed digits stay so a typo can be fixed').toHaveValue('000000');
  await expect(page.getByRole('button', { name: /^Gửi lại mã sau \d+ giây$/ })).toBeDisabled();
  const cookies = await page.context().cookies();
  expect(cookies.filter((cookie) => cookie.name.startsWith('sb-'))).toEqual([]);
  expect(await seriousAxeViolations(page)).toEqual([]);
});

test('an empty code gets app copy, not the browser bubble', async ({ page }) => {
  await requestCode(page, uniqueEmail('empty'));
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toHaveText('Nhập mã 6 chữ số trong email.');
  await expect(page.getByLabel('Mã 6 chữ số')).toHaveAttribute('aria-invalid', 'true');
});

test('a send that is refused is not blamed on the email', async ({ page, request }) => {
  const email = uniqueEmail('refused');
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  const first = await request.post(`${authApi.url}/otp`, { headers: authApi.headers, data: { email, create_user: true } });
  expect(first.ok(), 'the first send lands just before the form sends, inside the 1 s max_frequency window').toBe(true);
  await page.getByRole('button', { name: 'Gửi mã' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toHaveText(
    'Esta đã gửi nhiều mã trong giờ qua. Dùng mã mới nhất trong email, hoặc đợi ít phút rồi thử lại.',
  );
  await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'false');
});

test('the address on the code step wraps only where it has to', async ({ page }) => {
  const lines = () => page.locator('#code-sent strong').evaluate((email) => email.getClientRects().length);
  await requestCode(page, uniqueEmail('nguyen.demo'));
  expect(await lines(), 'an address that fits on a line stays whole').toBe(1);

  await requestCode(page, `${'nguyen.thi.demo.very.long.address'.repeat(2)}.${randomUUID().slice(0, 8)}@demo.esta.test`);
  expect(
    await page.locator('html').evaluate((html) => html.scrollWidth <= html.clientWidth),
    'a longer address wraps instead of scrolling the page sideways',
  ).toBe(true);
});

test('sign-out ends the session', async ({ page }) => {
  await signIn(page, uniqueEmail('signout'));
  await createHousehold(page, 'Gia đình Đăng Xuất Demo', 'Demo');
  await page.goto('/');
  await page.getByRole('button', { name: 'Tài khoản' }).click();
  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto('/');
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByText('Gia đình Đăng Xuất Demo')).toHaveCount(0);
});

test('a session cookie lasts 30 days', async ({ page }) => {
  await signIn(page, uniqueEmail('session'));
  const auth = (await page.context().cookies()).filter((cookie) => cookie.name.startsWith('sb-'));
  expect(auth.length).toBeGreaterThan(0);
  const days = (auth[0]?.expires ?? 0) / 86_400 - (await page.evaluate(() => Date.now())) / 86_400_000;
  expect(days).toBeGreaterThan(29);
  expect(days).toBeLessThanOrEqual(30);
});

test('session cookies are httpOnly, and Secure only when the request came over https', async ({ page, browser }) => {
  await signIn(page, uniqueEmail('cookie.http'));
  const overHttp = (await page.context().cookies()).filter((cookie) => cookie.name.startsWith('sb-'));
  expect(overHttp.length).toBeGreaterThan(0);
  expect(overHttp.map(({ httpOnly, secure }) => ({ httpOnly, secure }))).toEqual(
    overHttp.map(() => ({ httpOnly: true, secure: false })),
  );

  const httpsContext = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-proto': 'https' } });
  const httpsPage = await httpsContext.newPage();
  await signIn(httpsPage, uniqueEmail('cookie.https'));
  const overHttps = (await httpsContext.cookies()).filter((cookie) => cookie.name.startsWith('sb-'));
  expect(overHttps.length).toBeGreaterThan(0);
  expect(overHttps.map(({ httpOnly, secure }) => ({ httpOnly, secure }))).toEqual(
    overHttps.map(() => ({ httpOnly: true, secure: true })),
  );
  await httpsContext.close();
});

test('a language chosen on sign-in carries into the member and the English chrome', async ({ page, baseURL }) => {
  await page.context().addCookies([{ name: 'NEXT_LOCALE', value: 'en', url: baseURL ?? '' }]);
  await page.goto('/sign-in');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sign in');
  await expect(page.getByRole('button', { name: 'Send code' })).toBeVisible();

  await signIn(page, uniqueEmail('english'));
  await page.getByLabel('Household name').fill('Gia đình English Demo');
  await page.getByLabel('Your name').fill('Demo');
  await page.getByRole('button', { name: 'Create household' }).click();
  await page.getByRole('link', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Account' }).click();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();

  await page.getByRole('button', { name: 'Tiếng Việt' }).click();
  await expect(page.getByRole('button', { name: 'Đăng xuất' })).toBeVisible();
  await page.context().clearCookies({ name: 'NEXT_LOCALE' });
  await page.reload();
  await page.getByRole('button', { name: 'Tài khoản' }).click();
  await expect(page.getByRole('button', { name: 'Đăng xuất' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
});
