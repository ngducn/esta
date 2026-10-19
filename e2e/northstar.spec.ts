import { expect, test } from '@playwright/test';
import { startAgentWorker, type AgentWorker } from './helpers/agent-worker';
import { signIn } from './helpers/inbucket';
import { setClock } from './helpers/test-clock';
import { acceptEvery, editField, fixture, followReadyNotice, PHONE, serviceGet, shot, START, startWizard, step } from './helpers/wizard';

// SPEC §1.2 on the `northstar` seed, which has no Dãy trọ Dĩ An; `pnpm e2e:northstar` resets to it and runs this file.
test.describe.configure({ mode: 'serial', timeout: 180_000 });
test.skip(process.env.ESTA_NORTHSTAR !== '1', 'runs through pnpm e2e:northstar, on the northstar seed');
test.use({ video: process.env.ESTA_VIDEO === '1' ? { mode: 'on', size: PHONE } : 'off' });

const ME = 'me.lane1@demo.esta.test';
const STEPS_1_AND_2_BUDGET_MS = 90_000;
const REVIEW_READY_BUDGET_MS = 10_000;

type Truth = { parcels: { parcel_no: { value: string }; map_sheet_no: { value: string }; area_m2: { value: number }; purposes: { land_use_code: { value: string } }[] }[] };

let worker: AgentWorker | undefined;

test.afterAll(async ({ request }) => {
  await worker?.stop();
  await setClock(request, null);
});

test('steps 1 and 2: Mẹ signs in with the emailed code and adds Dãy trọ Dĩ An from its sổ hồng (FND-1, PRP-7, DOC-6)', async ({ page, request }) => {
  await setClock(request, START);
  worker = await startAgentWorker();
  const started = Date.now();
  const truth = fixture('northstar-di-an').truth as Truth;
  const [parcel] = truth.parcels;

  await test.step('1. Mẹ signs in on her phone with a 6-digit email code', async () => {
    await page.setViewportSize(PHONE);
    await page.context().addCookies([{ name: 'esta_theme', value: 'light', url: test.info().project.use.baseURL ?? '' }]);
    await signIn(page, ME);
    await expect(page).not.toHaveURL(/\/sign-in/);
  });

  const { propertyId, documentId } = await test.step('2. She adds Dãy trọ Dĩ An by photographing its sổ hồng, corrects one field and saves', async () => {
    // The three page photos go up as the one PDF the capture flow makes of them, the file its recording was made from.
    let uploadedAt = 0;
    const ids = await startWizard(page, {
      nickname: 'Dãy trọ Dĩ An',
      kind: 'rooming_house',
      photo: await fixture('northstar-di-an').upload(),
      beforeStart: async () => {
        uploadedAt = Date.now();
      },
    });
    expect(ids.documentId, 'the certificate was uploaded with the property').not.toBeNull();
    await expect
      .poll(async () => (await serviceGet<{ status: string }[]>(page, `document_status?document_id=eq.${ids.documentId}&select=status`))[0]?.status, {
        timeout: REVIEW_READY_BUDGET_MS,
        intervals: [250],
        message: `review ready within ${REVIEW_READY_BUDGET_MS / 1000} s of the upload in replay`,
      })
      .toBe('needs_review');
    console.log(`[perf] review ready ${Date.now() - uploadedAt} ms after the upload`);

    await page.getByTestId('skip-step').click();
    await step(page, 'owners');
    await followReadyNotice(page);
    await acceptEvery(page);
    await editField(page, 'parcels[0].area_m2', String(parcel?.area_m2.value).replace('.', ','));
    await page.getByTestId('review-submit').click();

    const confirm = page.getByTestId('address-confirm');
    await expect(confirm).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('certificate-address-text')).toContainText('tỉnh Bình Dương');
    await confirm.locator('[data-commune="25942"]').click();
    await expect(page.getByTestId('address-saved')).toContainText('Phường Dĩ An');
    await page.getByTestId('review-continue').click();
    await step(page, 'owners');
    await expect(page.getByTestId('owner-draft')).toHaveCount(1);
    await page.getByTestId('save-ownership').click();
    await step(page, 'use');
    await page.getByTestId('save-use').click();
    await step(page, 'finish');
    await expect(page.getByTestId('wizard-score')).toBeVisible();
    return ids;
  });

  const elapsed = Date.now() - started;
  console.log(`[perf] north-star steps 1 and 2 in ${elapsed} ms`);
  expect(elapsed, `north-star steps 1 and 2 within ${STEPS_1_AND_2_BUDGET_MS / 1000} s`).toBeLessThanOrEqual(STEPS_1_AND_2_BUDGET_MS);

  await page.getByTestId('wizard-open-property').click();
  await expect(page).toHaveURL(`/properties/${propertyId}`);
  const addresses = page.getByTestId('property-addresses');
  await expect(addresses.locator('[data-line="legal"] dt')).toHaveText('Theo sổ');
  await expect(addresses.locator('[data-line="legal"] dd')).toContainText('tỉnh Bình Dương');
  await expect(addresses.locator('[data-line="current"] dt')).toHaveText('Hiện nay');
  // Thành phố Hồ Chí Minh (79) shows as `TP. Hồ Chí Minh`, the short form DOMAIN-VN §4 uses on every address line.
  await expect(addresses.locator('[data-line="current"] dd')).toContainText('Phường Dĩ An, TP. Hồ Chí Minh');
  await shot(page, 'p2-08-northstar-header-390x844-light');

  const [property] = await serviceGet<{ current_address: { commune_code: string; province_code: string } }[]>(page, `properties?id=eq.${propertyId}&select=current_address`);
  expect(property?.current_address).toMatchObject({ commune_code: '25942', province_code: '79' });
  const parcels = await serviceGet<{ parcel_no: string; map_sheet_no: string; area_m2: number; purposes: { land_use_code: string }[] }[]>(
    page,
    `parcels?property_id=eq.${propertyId}&select=parcel_no,map_sheet_no,area_m2,purposes`,
  );
  expect(parcels).toEqual([
    {
      parcel_no: parcel?.parcel_no.value,
      map_sheet_no: parcel?.map_sheet_no.value,
      area_m2: parcel?.area_m2.value,
      purposes: parcel?.purposes.map((purpose) => expect.objectContaining({ land_use_code: purpose.land_use_code.value })),
    },
  ]);
  const [extraction] = await serviceGet<{ status: string; accepted_fields: Record<string, { decision: string }> }[]>(
    page,
    `document_extractions?document_id=eq.${documentId}&select=status,accepted_fields`,
  );
  expect(extraction?.status).toBe('accepted');
  expect(extraction?.accepted_fields['parcels[0].area_m2']?.decision, 'Mẹ corrected the area').toBe('edited');
});

test.skip('step 3: 8 rooms and 6 active monthly leases with deposits, paid through 30/09/2026 (Phase 3, P3-17)', () => {});
test.skip('step 4: October invoices issued for the 6 leases, each with a VietQR code and a receipt image (Phase 3, P3-17)', () => {});
test.skip('step 5: Ryan imports the October statement, confirms a suggestion, Mẹ records one cash payment (Phase 3, P3-17)', () => {});
test.skip('step 6: the October board shows one room overdue 6 days and its Zalo reminder (Phase 3, P3-17)', () => {});
test.skip('step 7: the 2026-10-08 morning brief lists the overdue room, the ending lease and a market item (Phase 5, P5-10)', () => {});
test.skip('step 8: the tax card shows year-to-date rent against 500 million VND (Phase 4, P4-05)', () => {});
test.skip('step 9: Ryan asks how much Dĩ An collected this month and gets the exact amount (Phase 5, P5-10)', () => {});
