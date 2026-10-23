import { expect, test } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { demoProperty } from '../apps/connector/src/test/demo-property.ts';
import { call } from '../apps/connector/src/test/stdio.ts';
import { connectorFor, connectorLogin } from './helpers/connector';
import { DEMO_PASSWORD } from './helpers/password';
import { DESKTOP, openNewHousehold, PHONE, recordForPr, seriousAxeViolations, serviceGet, shot } from './helpers/wizard';

const pause = recordForPr();
const plannedSchema = z.object({ planId: z.string(), items: z.array(z.object({ id: z.string() })) });

async function addThroughClaude(connector: ReturnType<typeof connectorFor>, summary: string, code: string) {
  const planned = plannedSchema.parse((await call(connector, 'plan_changes', { summary, items: [{ op: 'property.create', input: { property: demoProperty(code) } }] })).json());
  expect((await call(connector, 'apply_plan', { plan_id: planned.planId })).json()).toMatchObject({ status: 'applied' });
  return planned.items[0]?.id ?? '';
}

test('Ryan sees what Claude changed, undoes one batch, and reads why another cannot be undone', async ({ page }) => {
  test.skip(test.info().project.name !== 'mobile', 'one household covers both viewports, which the test sets itself');
  test.setTimeout(180_000);
  const work = mkdtempSync(join(tmpdir(), 'esta-e2e-history-'));
  const sessionFile = join(work, 'session.json');
  const email = await openNewHousehold(page, 'light', PHONE, DEMO_PASSWORD);
  expect(await connectorLogin(sessionFile, email), 'the connector signs in as the new operator').toBe(0);
  const connector = connectorFor(sessionFile);
  const [added, editedLater] = await (async () => {
    try {
      await connector.connect();
      return [await addThroughClaude(connector, 'Demo: thêm Nhà phố Q7', 'Q7'), await addThroughClaude(connector, 'Demo: thêm Nhà phố Bình Thạnh', 'BTH')];
    } finally {
      await connector.client.close();
      rmSync(work, { recursive: true, force: true });
    }
  })();

  await page.goto(`/properties/${editedLater}/edit`);
  await page.getByTestId('archive-property').click();
  await expect(page).toHaveURL(/\/properties$/);

  await page.goto('/settings');
  await page.getByTestId('history-link').click();
  await expect(page).toHaveURL(/\/settings\/history$/);
  const rows = page.getByTestId('batch-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('Demo: thêm Nhà phố Bình Thạnh');
  await expect(rows.nth(1)).toContainText('Demo: thêm Nhà phố Q7');
  for (const row of await rows.all()) await expect(row).toContainText('qua Claude');
  await pause(page);

  const undo = async (row: number) => {
    await rows.nth(row).getByRole('button', { name: 'Hoàn tác' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('Đã lưu trữ');
    await pause(page);
    await dialog.getByRole('button', { name: 'Hoàn tác' }).click();
  };

  await undo(0);
  await expect(rows.first().getByTestId('undo-status')).toHaveText(
    'Không hoàn tác được.Có người đã sửa lại phần này sau đó. Hãy sửa trực tiếp trên màn hình đó.',
  );
  await expect(rows.first().getByTestId('batch-status')).toHaveText('Đã áp dụng');
  await pause(page);
  await shot(page, 'history-refused-390x844');

  await undo(1);
  await expect(rows.nth(1).getByTestId('batch-status')).toHaveText('Đã hoàn tác');
  await expect(rows.nth(1)).toContainText('1 tài sản Claude đã thêm nay ở Đã lưu trữ.');
  await expect(rows.nth(1).getByRole('button', { name: 'Hoàn tác' })).toHaveCount(0);
  const stored = await serviceGet<{ id: string; deleted_at: string | null }[]>(page, `properties?id=in.(${added},${editedLater})&select=id,deleted_at`);
  expect(stored.every((row) => row.deleted_at !== null), 'the undone property and the one archived by hand are both in Đã lưu trữ').toBe(true);
  expect(await seriousAxeViolations(page)).toEqual([]);
  await pause(page);
  await shot(page, 'history-undone-390x844');

  await page.setViewportSize(DESKTOP);
  await page.context().addCookies([{ name: 'esta_theme', value: 'dark', url: test.info().project.use.baseURL ?? '' }]);
  await page.reload();
  await expect(rows).toHaveCount(2);
  expect(await seriousAxeViolations(page)).toEqual([]);
  await shot(page, 'history-1440x900-dark');

  await rows.nth(1).getByRole('link', { name: 'Đã lưu trữ' }).click();
  await expect(page.getByTestId('archived-row').filter({ hasText: 'Demo Nhà phố Q7' })).toBeVisible();
});
