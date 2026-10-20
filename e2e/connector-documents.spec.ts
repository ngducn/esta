import { expect, test, type Page } from '@playwright/test';
import { spawn } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { z } from 'zod';
import { call, stdioConnector } from '../apps/connector/src/test/stdio.ts';
import { parseSlot } from '../scripts/slot.ts';
import { DEMO_PASSWORD } from './helpers/password';
import { DESKTOP, openNewHousehold, PHONE, seriousAxeViolations, serviceGet, shot, storedObject } from './helpers/wizard';

const repoRoot = join(import.meta.dirname, '..');
const slot = String(parseSlot(process.env.ESTA_SLOT));

const PAPERS = [
  { file: 'so-hong-demo-le-van-sy.jpg', category: 'certificate', title: 'Sổ hồng Demo Lê Văn Sỹ', byHand: 'Sổ hồng Demo tải tay' },
  { file: 'hop-dong-thue-demo-le-van-sy.pdf', category: 'lease_contract', title: 'Hợp đồng thuê Demo Lê Văn Sỹ', byHand: 'Hợp đồng thuê Demo tải tay' },
] as const;

const plannedSchema = z.object({ planId: z.string(), items: z.array(z.object({ status: z.literal('change'), id: z.string() })) });
const appliedSchema = z.object({ status: z.literal('applied') });

/** `pnpm connector:login` as the README tells Ryan to run it, with his answers typed in. */
function connectorLogin(sessionFile: string, email: string) {
  const child = spawn('pnpm', ['--silent', '--dir', repoRoot, 'connector:login'], { env: { ...process.env, ESTA_SLOT: slot, ESTA_SESSION_FILE: sessionFile }, stdio: ['pipe', 'ignore', 'inherit'] });
  child.stdin.end(`${email}\n${DEMO_PASSWORD}\n`);
  return new Promise<number | null>((resolve) => child.on('exit', resolve));
}

async function previewSizes(page: Page, storagePath: string) {
  const folder = storagePath.replace(/[^/]+$/, '');
  return Promise.all(
    ['thumb.webp', 'review.webp'].map(async (name) => {
      const { format, width, height } = await sharp(await storedObject(page, `${folder}${name}`)).metadata();
      return { name, format, width, height };
    }),
  );
}

async function uploadInVault(page: Page, path: string, category: string, title: string) {
  await page.getByTestId('add-document').click();
  await page.getByTestId('file-input').setInputFiles(path);
  await expect(page.getByTestId('upload-preview')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('document-category').selectOption(category);
  await page.getByTestId('document-title').fill(title);
  await page.getByTestId('save-document').click();
  await page.getByTestId('duplicate-dialog').getByRole('button', { name: 'Vẫn tải lên' }).click();
  await expect(page.getByTestId('document-link').filter({ hasText: title })).toBeVisible({ timeout: 30_000 });
}

test('a paper Claude files from the import folder looks in the vault exactly like the same file uploaded there', async ({ page }) => {
  test.skip(test.info().project.name !== 'mobile', 'one household covers both viewports, which the test sets itself');
  test.setTimeout(180_000);
  const work = mkdtempSync(join(tmpdir(), 'esta-e2e-connector-'));
  const imports = join(work, 'import');
  cpSync(join(repoRoot, 'fixtures', 'connector-demo', 'Demo'), join(imports, 'Demo'), { recursive: true });
  const sessionFile = join(work, 'session.json');
  const email = await openNewHousehold(page, 'light', PHONE, DEMO_PASSWORD);
  expect(await connectorLogin(sessionFile, email), 'the connector signs in as the new operator').toBe(0);
  const connector = stdioConnector({ command: 'pnpm', args: ['--silent', '--dir', repoRoot, 'connector'], env: { ESTA_SLOT: slot, ESTA_SESSION_FILE: sessionFile, ESTA_IMPORT_ROOTS: imports } });
  try {
    await connector.connect();
    const { suggestions } = z
      .object({ suggestions: z.array(z.object({ communeCode: z.string(), provinceCode: z.string() })) })
      .parse((await call(connector, 'resolve_address', { text: '12/45 Lê Văn Sỹ, Phường 13, Quận 3, TP.HCM' })).json());
    const [unit] = suggestions;
    const property = {
      nickname: 'Nhà phố Demo Lê Văn Sỹ',
      code: 'DEMOQ3',
      kind: 'townhouse',
      kind_details: {},
      use_mode: 'rental',
      legal_status: 'certified',
      current_address: { house_no: '12/45', street: 'Lê Văn Sỹ', commune_code: unit?.communeCode, province_code: unit?.provinceCode },
      certificate_address_text: null,
      acquired_on: null,
      acquisition_kind: null,
      acquisition_price_vnd: null,
      notes: null,
    };
    const plannedProperty = plannedSchema.parse((await call(connector, 'plan_changes', { summary: 'Demo: 1 tài sản', items: [{ op: 'property.create', input: { property } }] })).json());
    appliedSchema.parse((await call(connector, 'apply_plan', { plan_id: plannedProperty.planId })).json());
    const propertyId = plannedProperty.items[0]?.id ?? '';
    const papers = PAPERS.map(({ file, category, title }) => ({ op: 'document.attach', input: { path: `Demo/${file}`, property_id: propertyId, category, title } }));
    const plannedPapers = plannedSchema.parse((await call(connector, 'plan_changes', { summary: 'Demo: 2 giấy tờ', items: papers })).json());
    appliedSchema.parse((await call(connector, 'apply_plan', { plan_id: plannedPapers.planId })).json());

    await page.goto(`/properties/${propertyId}/documents`);
    for (const paper of PAPERS) await uploadInVault(page, join(imports, 'Demo', paper.file), paper.category, paper.byHand);

    const rows = await serviceGet<{ title: string; sha256: string; storage_path: string }[]>(page, `documents?property_id=eq.${propertyId}&select=title,sha256,storage_path`);
    for (const paper of PAPERS) {
      const viaClaude = rows.find((row) => row.title === paper.title);
      const viaVault = rows.find((row) => row.title === paper.byHand);
      expect(viaClaude?.sha256, `${paper.file} is the same file both ways`).toBe(viaVault?.sha256);
      const claudeSizes = await previewSizes(page, viaClaude?.storage_path ?? '');
      expect(claudeSizes.every((size) => size.format === 'webp')).toBe(true);
      expect(claudeSizes, `${paper.file}: the connector's thumbnail and review copy match the browser's`).toEqual(await previewSizes(page, viaVault?.storage_path ?? ''));
    }

    await page.reload();
    const thumbnails = page.getByTestId('document-tile').locator('img');
    await expect(thumbnails).toHaveCount(4);
    for (const image of await thumbnails.all()) {
      await image.scrollIntoViewIfNeeded();
      await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth), { timeout: 15_000 }).toBeGreaterThan(0);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(await seriousAxeViolations(page)).toEqual([]);
    await shot(page, 'connector-vault-390x844');
    await page.setViewportSize(DESKTOP);
    await expect(thumbnails).toHaveCount(4);
    await shot(page, 'connector-vault-1440x900');
  } finally {
    await connector.client.close();
    rmSync(work, { recursive: true, force: true });
  }
});
