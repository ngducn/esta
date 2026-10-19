import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';
import { e2eServiceHeaders } from '../../scripts/e2e-service.ts';
import { parseSlot } from '../../scripts/slot.ts';
import { slotEnv } from '../../scripts/slot-env.ts';
import { extractionFixtures, type UploadFile } from '../../fixtures/certificates/generator/uploads.tsx';
import { signIn } from './inbucket';

const repoRoot = join(import.meta.dirname, '../..');
const env = slotEnv(repoRoot, parseSlot(process.env.ESTA_SLOT), { withKeys: false });
export const rest = `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1`;
const service = e2eServiceHeaders();
export const PHONE = { width: 390, height: 844 };
export const DESKTOP = { width: 1440, height: 900 };
export const START = '2026-10-07T09:00:00+07:00';
const evidence = process.env.ESTA_EVIDENCE_DIR;

export function fixture(id: string) {
  const found = extractionFixtures().find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`no fixture ${id}`);
  return found;
}

export async function open(page: Page, email: string, theme: 'light' | 'dark', viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  await page.context().addCookies([{ name: 'esta_theme', value: theme, url: test.info().project.use.baseURL ?? '' }]);
  await signIn(page, email);
}

export async function serviceGet<T>(page: Page, path: string): Promise<T> {
  const response = await page.request.get(`${rest}/${path}`, { headers: service });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()) as T;
}

export async function servicePatch(page: Page, path: string, data: unknown) {
  const response = await page.request.patch(`${rest}/${path}`, { headers: { ...service, 'content-type': 'application/json' }, data });
  expect(response.ok(), await response.text()).toBe(true);
}

export async function seriousAxeViolations(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id} ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

/** A full-page screenshot into `ESTA_EVIDENCE_DIR`, once the document page has drawn when one shows. */
export async function shot(page: Page, name: string) {
  if (evidence === undefined) return;
  const pager = page.getByTestId('document-pager');
  if ((await pager.count()) > 0 && (await pager.isVisible())) {
    await expect(pager.locator('[data-testid="document-page"]:not([data-drawn="false"])')).toBeVisible({ timeout: 15_000 });
  }
  await page.screenshot({ path: join(evidence, `${name}.png`), fullPage: true });
}

export const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

export type WizardIds = { propertyId: string; documentId: string | null };

export function wizardIds(page: Page): WizardIds {
  const params = new URL(page.url()).searchParams;
  return { propertyId: params.get('property') ?? '', documentId: params.get('document') };
}

export const step = (page: Page, name: string) => expect(page.getByTestId('property-wizard')).toHaveAttribute('data-step', name, { timeout: 30_000 });

/**
 * Step 1 of the wizard: a fixture through `Chụp ảnh` or `Chọn tệp`, or `Bỏ qua`, then the nickname and kind. Lane
 * households seed some fixture pages as documents, so the duplicate warning is answered `Vẫn tải lên`.
 */
export async function startWizard(
  page: Page,
  { nickname, kind, photo, via = 'file', beforeStart }: { nickname: string; kind: string; photo: UploadFile | null; via?: 'camera' | 'file'; beforeStart?: () => Promise<void> },
): Promise<WizardIds> {
  await page.goto('/properties/new');
  await expect(page.getByTestId('wizard-photo')).toBeVisible();
  await expect(page.locator('[data-testid="wizard-photo"] fieldset')).toBeEnabled();
  if (photo === null) await page.getByTestId('skip-photo').click();
  else {
    await page.getByTestId(via === 'camera' ? 'camera-input' : 'file-input').setInputFiles(photo);
    await expect(page.getByTestId('upload-preview')).toBeVisible({ timeout: 30_000 });
  }
  await page.getByTestId('nickname').fill(nickname);
  await page.getByTestId('kind-select').selectOption(kind);
  await beforeStart?.();
  await page.getByTestId('wizard-start').click();
  const duplicate = page.getByTestId('duplicate-dialog');
  await expect(page.locator('[data-testid="property-wizard"][data-step="details"]').or(duplicate)).toBeVisible({ timeout: 30_000 });
  if (await duplicate.isVisible()) await duplicate.getByRole('button').last().click();
  await step(page, 'details');
  return wizardIds(page);
}

export const fieldRows = (page: Page) => page.getByTestId('extraction-field');
const fieldRow = (page: Page, path: string) => page.locator(`[data-testid="extraction-field"][data-path="${path}"]`);

export async function acceptEvery(page: Page) {
  await expect(fieldRows(page).first()).toBeVisible({ timeout: 15_000 });
  const count = await fieldRows(page).count();
  for (let index = 0; index < count; index += 1) {
    const current = fieldRows(page).nth(index);
    if ((await current.getAttribute('data-decision')) === 'none') await current.getByTestId('field-correct').click();
  }
  await expect(page.locator('[data-testid="extraction-field"][data-decision="none"]')).toHaveCount(0);
}

export async function editField(page: Page, path: string, text: string) {
  await fieldRow(page, path).getByTestId('field-edit').click();
  const input = fieldRow(page, path).getByTestId('field-input');
  await input.fill('');
  await input.pressSequentially(text);
  await fieldRow(page, path).getByTestId('field-done').click();
}

/** From any step after the photo: follows `Xem lại ngay` once the read is ready, without reloading the page. */
export async function followReadyNotice(page: Page, timeout = 30_000) {
  const notice = page.getByTestId('review-ready-notice');
  await expect(notice).toHaveAttribute('data-state', 'ready', { timeout });
  await notice.getByTestId('review-ready-link').click();
  await step(page, 'review');
}
