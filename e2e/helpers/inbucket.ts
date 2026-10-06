import { expect, type Page } from '@playwright/test';
import { z } from 'zod';
import { parseSlot, slotPorts } from '../../scripts/slot.ts';

const mailbox = `http://127.0.0.1:${slotPorts(parseSlot(process.env.ESTA_SLOT)).inbucket}/api/v1`;

const searchResult = z.object({ messages: z.array(z.object({ ID: z.string() })) });
const message = z.object({ Subject: z.string(), Text: z.string(), HTML: z.string() });

export type Mail = z.infer<typeof message>;

function query(email: string): string {
  return new URLSearchParams({ query: `to:"${email}"` }).toString();
}

/** Clears the address's mail so the next code read cannot pick up a stale one. */
export async function clearMailbox(email: string): Promise<void> {
  const response = await fetch(`${mailbox}/search?${query(email)}`, { method: 'DELETE' });
  expect(response.ok, `clearing mail for ${email}`).toBe(true);
}

export async function latestMail(email: string): Promise<Mail> {
  let id: string | undefined;
  await expect
    .poll(
      async () => {
        const response = await fetch(`${mailbox}/search?${query(email)}`);
        id = searchResult.parse(await response.json()).messages[0]?.ID;
        return id;
      },
      { message: `waiting for mail to ${email}`, timeout: 10_000 },
    )
    .toBeDefined();
  const response = await fetch(`${mailbox}/message/${id}`);
  return message.parse(await response.json());
}

export async function latestCode(email: string): Promise<string> {
  const codes = (await latestMail(email)).Text.match(/\b\d{6}\b/g) ?? [];
  expect(codes, `exactly one 6-digit code in the mail to ${email}`).toHaveLength(1);
  return codes[0] ?? '';
}

/** Requests a code on /sign-in and leaves the page on the code step. */
export async function requestCode(page: Page, email: string): Promise<void> {
  await clearMailbox(email);
  await page.goto('/sign-in');
  await page.locator('input[name="email"]').fill(email);
  await page.locator('button[value="send"]').click();
  await expect(page.locator('input[name="code"]')).toBeVisible();
}

/** Signs in through the UI in either language. `typeCode` lets a test enter the code as a person would. */
export async function signIn(page: Page, email: string, typeCode = (code: string) => code): Promise<void> {
  await requestCode(page, email);
  await page.locator('input[name="code"]').fill(typeCode(await latestCode(email)));
  await page.locator('button[value="verify"]').click();
  await page.waitForURL((url) => url.pathname !== '/sign-in');
}
