import { expect, type Page } from '@playwright/test';
import * as mail from '../../scripts/inbucket-code.ts';
import { parseSlot } from '../../scripts/slot.ts';

const mailbox = mail.slotMailbox(parseSlot(process.env.ESTA_SLOT));

export function latestMail(email: string): Promise<mail.Mail> {
  return mail.latestMail(email, mailbox);
}

export async function requestCode(page: Page, email: string): Promise<void> {
  await mail.clearMailbox(email, mailbox);
  await page.goto('/sign-in');
  await page.locator('input[name="email"]').fill(email);
  await page.locator('button[value="send"]').click();
  await expect(page.locator('input[name="code"]')).toBeVisible();
}

export async function signIn(page: Page, email: string, typeCode = (code: string) => code): Promise<void> {
  await requestCode(page, email);
  await page.locator('input[name="code"]').fill(typeCode(await mail.latestCode(email, mailbox)));
  await page.locator('button[value="verify"]').click();
  await page.waitForURL((url) => url.pathname !== '/sign-in');
}
