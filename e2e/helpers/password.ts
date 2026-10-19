import { expect, type Page } from '@playwright/test';
import { clearMail, latestCode } from './inbucket';

export { DEMO_PASSWORD } from '../../supabase/seed/generator/households.ts';

const CODE_STEP_TIMEOUT_MS = 15_000;

export async function signInWithPassword(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/sign-in');
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[value="sign-in"]').click();
  await page.waitForURL((url) => url.pathname !== '/sign-in');
}

/** Fills /sign-up and sends the code, leaving the account unconfirmed on the code step. */
export async function startAccount(page: Page, email: string, password: string): Promise<void> {
  await clearMail(email);
  await page.goto('/sign-up');
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[value="send"]').click();
  await expect(page.locator('input[name="code"]')).toBeVisible({ timeout: CODE_STEP_TIMEOUT_MS });
}

/** Creates the account through /sign-up and confirms it with the emailed code, which signs the page in. */
export async function createAccount(page: Page, email: string, password: string): Promise<void> {
  await startAccount(page, email, password);
  await page.locator('input[name="code"]').fill(await latestCode(email));
  await page.locator('button[value="verify"]').click();
  await page.waitForURL((url) => url.pathname !== '/sign-up');
}
