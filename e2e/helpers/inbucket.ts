import { expect, type Page } from '@playwright/test';
import { mkdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import * as mail from '../../scripts/inbucket-code.ts';
import { parseSlot } from '../../scripts/slot.ts';

const slot = parseSlot(process.env.ESTA_SLOT);
const mailbox = mail.slotMailbox(slot);

/** Auth's `max_frequency` for one address, plus a margin, so the next holder's send is never refused. */
const SEND_SPACING_MS = 1_200;
const CODE_STEP_TIMEOUT_MS = 15_000;
/** Longer than any sign-in, so a lock left by a killed test is taken over. */
const STALE_LOCK_MS = 60_000;

export function latestMail(email: string): Promise<mail.Mail> {
  return mail.latestMail(email, mailbox);
}

export async function requestCode(page: Page, email: string): Promise<void> {
  await mail.clearMailbox(email, mailbox);
  await page.goto('/sign-in/code');
  await page.locator('input[name="email"]').fill(email);
  await page.locator('button[value="send"]').click();
  const codeStep = page.locator('input[name="code"]');
  const refusal = page.getByRole('main').getByRole('alert').filter({ hasText: /\S/ });
  // The send goes through auth and SMTP, which a loaded machine slows; a refusal returns at once, so callers can retry.
  await expect(codeStep.or(refusal)).toBeVisible({ timeout: CODE_STEP_TIMEOUT_MS });
  if (!(await codeStep.isVisible())) throw new Error(`The send was refused: ${await refusal.innerText()}`);
}

/**
 * A new code voids the previous one, so two workers signing in to one seeded account at once fail each other.
 * The lock is a directory per slot and address, which every Playwright worker and project sees.
 */
async function withAddressLock(email: string, run: () => Promise<void>): Promise<void> {
  const lock = join(tmpdir(), `esta-e2e-sign-in-${slot}-${email}`);
  for (;;) {
    try {
      mkdirSync(lock);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const held = Date.now() - (statSync(lock, { throwIfNoEntry: false })?.mtimeMs ?? Date.now());
      if (held > STALE_LOCK_MS) rmSync(lock, { recursive: true, force: true });
      else await sleep(100);
    }
  }
  const startedAt = Date.now();
  try {
    await run();
  } finally {
    await sleep(Math.max(0, startedAt + SEND_SPACING_MS - Date.now()));
    rmSync(lock, { recursive: true, force: true });
  }
}

export async function signIn(page: Page, email: string, typeCode = (code: string) => code): Promise<void> {
  await withAddressLock(email, async () => {
    await requestCode(page, email);
    await page.locator('input[name="code"]').fill(typeCode(await mail.latestCode(email, mailbox)));
    await page.locator('button[value="verify"]').click();
    await page.waitForURL((url) => url.pathname !== '/sign-in/code');
  });
}
