import { expect, type Page } from '@playwright/test';
import { seedId } from '../../supabase/seed/generator/ids.ts';
import { serviceDelete } from './wizard';

/**
 * Deletes every conversation a lane member started, so her next message opens a first segment with no earlier one to
 * seed it. Replay recordings key on the prompt, which an earlier segment of another spec would change.
 */
export async function freshThread(page: Page, person: 'me' | 'ryan', lane: number) {
  await serviceDelete(page, `conversations?created_by=eq.${seedId(`seed:user:${person}-lane-${lane}`)}`);
}

/** Sends one message from the reply box at the end of the thread and waits until it shows there. */
export async function sendInThread(page: Page, message: string, { label = 'Viết cho Trợ lý' }: { label?: string } = {}) {
  if (!new URL(page.url()).pathname.endsWith('/assistant')) await page.goto('/assistant');
  const sent = await page.getByTestId('question').count();
  await expect(page.getByTestId('composer-send'), 'the box opens once the answer before it settles').toBeEnabled();
  await page.getByRole('textbox', { name: label }).fill(message);
  await page.getByTestId('composer-send').click();
  await expect(page.getByTestId('question')).toHaveCount(sent + 1);
  await expect(page.getByTestId('question').last()).toContainText(message);
}

/** A row of `Cần xử lý` by its note's title. */
export const pinnedRow = (page: Page, title: string) => page.getByTestId('pinned-item').filter({ has: page.getByTestId('pinned-title').getByText(title, { exact: true }) });

/** How much of the screen `Cần xử lý` takes, and whether its list is open. */
export async function pinnedArea(page: Page) {
  const band = page.getByTestId('pinned');
  const [box, open, viewport] = [await band.boundingBox(), await band.locator('details').evaluate((details: HTMLDetailsElement) => details.open), page.viewportSize()];
  return { share: (box?.height ?? 0) / (viewport?.height ?? 1), open };
}
