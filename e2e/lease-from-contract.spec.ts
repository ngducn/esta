import { expect, test, type Page } from '@playwright/test';
import { seedId } from '../supabase/seed/generator/ids.ts';
import { startAgentWorker, type AgentWorker } from './helpers/agent-worker';
import { laneProperty } from './helpers/seed';
import { setClock } from './helpers/test-clock';
import { DESKTOP, PHONE, START, fixture, open, recordForPr, serviceGet, servicePatch, seriousAxeViolations, shot, toast } from './helpers/wizard';

// The replay worker and the test clock are one per slot, so the rules run in order in the `clock` project.
test.describe.configure({ mode: 'serial' });
const hold = recordForPr();

const LANE = 5;
const property = laneProperty(LANE, 'di-an');
const unit = (n: number) => seedId(`seed:unit:lane-${LANE}:di-an:${n}`);
const seededContract = seedId(`seed:document:lane-${LANE}:di-an:lease-phong-8`);
const newLeaseFrom = (documentId: string) => `/properties/${property}/rental/leases/new?fromDocument=${documentId}`;

let worker: AgentWorker | undefined;
test.beforeEach(({ request }) => setClock(request, START));
test.afterAll(async ({ request }) => Promise.all([worker?.stop(), setClock(request, null)]));

type StoredLease = { id: string; status: string; start_date: string; end_date: string; rent_vnd: number; deposit_vnd: number; billing_cycle_months: number; tenant: { full_name: string; phone: string } };
const leasesOn = (page: Page, unitId: string) =>
  serviceGet<StoredLease[]>(page, `leases?unit_id=eq.${unitId}&status=eq.draft&select=id,status,start_date,end_date,rent_vnd,deposit_vnd,billing_cycle_months,tenant:parties!leases_household_id_tenant_party_id_fkey(full_name,phone)`);
const contractOf = async (page: Page, documentId: string) =>
  (await serviceGet<{ lease_id: string | null; ocr_text: string | null }[]>(page, `documents?id=eq.${documentId}&select=lease_id,ocr_text`))[0];

const marks = (page: Page) => page.getByTestId('from-contract');
const field = (page: Page, name: string) => page.getByRole('textbox', { name, exact: true });

async function expectFilled(page: Page, terms: { unit: string; start: string; end: string; rent: string; deposit: string; tenant: string; phone: string }) {
  await expect(page.getByTestId('form-loading')).toHaveCount(0);
  await expect(page).toHaveTitle(/\S/);
  await expect(page.getByTestId('from-contract-intro')).toHaveText('Các ô có dấu này lấy từ hợp đồng đã quét. Kiểm tra lại rồi lưu.');
  await expect(page.locator('#lease-unit')).toHaveValue(terms.unit);
  await expect(field(page, 'Ngày bắt đầu')).toHaveValue(terms.start);
  await expect(field(page, 'Ngày kết thúc')).toHaveValue(terms.end);
  await expect(field(page, 'Tiền thuê mỗi tháng')).toHaveValue(terms.rent);
  await expect(field(page, 'Tiền cọc')).toHaveValue(terms.deposit);
  await expect(page.locator('#lease-cycle')).toHaveValue('1');
  await expect(page.locator('#tenant-name')).toHaveValue(terms.tenant);
  await expect(page.locator('#tenant-phone')).toHaveValue(terms.phone);
  // Phòng, start, end, rent, deposit, cycle and the tenant the contract names.
  await expect(marks(page)).toHaveCount(7);
  for (const mark of await marks(page).all()) await expect(mark).toHaveText('Từ hợp đồng đã quét');
}

async function confirm(page: Page) {
  await page.getByTestId('save-tenant').click();
  await expect(page.locator('#lease-tenant')).not.toHaveValue('', { timeout: 15_000 });
  await page.getByTestId('save-lease').click();
  await expect(page).toHaveURL(/\/rental\/leases\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  return page.url().split('/').at(-1) ?? '';
}

test('rule 1: Ryan opens the seeded Phòng 8 contract, taps Tạo hợp đồng thuê từ tài liệu này, finds every term marked, and only Lưu writes the draft that keeps the contract', async ({ page }) => {
  await open(page, 'ryan.lane5@demo.esta.test', 'dark', DESKTOP);
  await page.goto(`/documents/${seededContract}/review`);
  await expect(page.getByTestId('review-accepted')).toContainText('Hợp đồng thuê chưa được lưu.');
  await expect(page.getByTestId('create-lease')).toHaveText('Tạo hợp đồng thuê từ tài liệu này');
  await shot(page, 'p3-19-accepted-contract-1440x900-dark');
  await page.getByTestId('create-lease').click();
  await expect(page).toHaveURL(newLeaseFrom(seededContract));

  await expectFilled(page, { unit: unit(8), start: '15/10/2026', end: '14/10/2027', rent: '3.500.000', deposit: '3.500.000', tenant: 'Lê Văn Demo', phone: '0903 123 456' });
  expect(await seriousAxeViolations(page)).toEqual([]);
  await shot(page, 'p3-19-prefilled-1440x900-dark');
  expect(await leasesOn(page, unit(8)), 'opening the filled form saves nothing').toEqual([]);

  await field(page, 'Tiền thuê mỗi tháng').fill('3.600.000');
  await expect(marks(page), 'a changed rent loses its mark').toHaveCount(6);
  const leaseId = await confirm(page);

  expect(await leasesOn(page, unit(8))).toEqual([
    {
      id: leaseId,
      status: 'draft',
      start_date: '2026-10-15',
      end_date: '2027-10-14',
      rent_vnd: 3_600_000,
      deposit_vnd: 3_500_000,
      billing_cycle_months: 1,
      tenant: { full_name: 'Lê Văn Demo', phone: '+84903123456' },
    },
  ]);
  expect((await contractOf(page, seededContract))?.lease_id, 'the contract now belongs to the lease').toBe(leaseId);

  await page.goto(`/documents/${seededContract}/review`);
  await expect(page.getByTestId('create-lease')).toHaveCount(0);
  await expect(page.getByTestId('review-accepted')).toContainText('Đã lưu vào hồ sơ');
  await expect(page.getByTestId('open-lease')).toHaveAttribute('href', `/properties/${property}/rental/leases/${leaseId}`);
  await page.goto(newLeaseFrom(seededContract));
  await expect(page.getByTestId('form-loading')).toHaveCount(0);
  await expect(page.getByTestId('from-contract-intro'), 'a contract that has its lease fills no second one').toHaveCount(0);
});

test('rule 2: Mẹ photographs the Phòng 7 contract, checks the reading, and Lưu opens the lease form filled in for her to confirm', async ({ page }) => {
  worker = await startAgentWorker();
  await open(page, 'me.lane5@demo.esta.test', 'light', PHONE);
  await page.goto(`/properties/${property}/documents`);
  await page.getByTestId('add-document').click();
  await page.getByTestId('camera-input').setInputFiles(await fixture('lease-di-an-phong-7-photo').upload());
  await expect(page.getByTestId('upload-preview')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('document-category').selectOption('lease_contract');
  await page.getByTestId('document-title').fill('Hợp đồng thuê Phòng 7 Demo');
  await page.getByTestId('save-document').click();
  await expect(toast(page).getByText(/Hợp đồng thuê Phòng 7 Demo/)).toBeVisible({ timeout: 30_000 });
  const [uploaded] = await serviceGet<{ id: string }[]>(page, `documents?property_id=eq.${property}&title=eq.${encodeURIComponent('Hợp đồng thuê Phòng 7 Demo')}&select=id`);
  const documentId = uploaded?.id ?? '';
  const tile = page.locator(`[data-testid="document-tile"][data-document-id="${documentId}"]`);
  await expect(tile.getByTestId('extraction-status')).toHaveText('Chờ xem lại', { timeout: 15_000 });
  await hold(page);

  await tile.getByTestId('review-link').click();
  await expect(page).toHaveURL(`/documents/${documentId}/review`);
  const rows = page.getByTestId('extraction-field');
  await expect(rows.first()).toBeVisible();
  for (const row of await rows.all()) if ((await row.getAttribute('data-decision')) === 'none') await row.getByTestId('field-correct').click();
  await expect(page.locator('[data-testid="extraction-field"][data-decision="none"]')).toHaveCount(0);
  await shot(page, 'p3-19-review-390x844-light');
  expect(await seriousAxeViolations(page)).toEqual([]);
  await page.getByTestId('review-submit').click();
  await expect(page).toHaveURL(newLeaseFrom(documentId), { timeout: 15_000 });
  expect((await contractOf(page, documentId))?.ocr_text, 'accepting files the contract text for search').toContain('HỢP ĐỒNG THUÊ PHÒNG TRỌ');

  await expectFilled(page, { unit: unit(7), start: '01/11/2026', end: '30/04/2027', rent: '3.200.000', deposit: '6.400.000', tenant: 'Phạm Minh Demo', phone: '0938 765 432' });
  expect(await seriousAxeViolations(page)).toEqual([]);
  await shot(page, 'p3-19-prefilled-390x844-light');
  await hold(page);
  expect(await leasesOn(page, unit(7)), 'nothing is saved before Mẹ confirms').toEqual([]);

  const leaseId = await confirm(page);
  await hold(page);
  expect(await leasesOn(page, unit(7))).toEqual([
    {
      id: leaseId,
      status: 'draft',
      start_date: '2026-11-01',
      end_date: '2027-04-30',
      rent_vnd: 3_200_000,
      deposit_vnd: 6_400_000,
      billing_cycle_months: 1,
      tenant: { full_name: 'Phạm Minh Demo', phone: '+84938765432' },
    },
  ]);
  expect((await contractOf(page, documentId))?.lease_id).toBe(leaseId);
});

test('rule 3: a contract that prints +84 903 123 456 for a tenant on file selects him, with no quick add', async ({ page }) => {
  await open(page, 'ryan.lane5@demo.esta.test', 'light', PHONE);
  const [lease] = await serviceGet<{ tenant_party_id: string }[]>(page, `leases?unit_id=eq.${unit(8)}&status=eq.draft&select=tenant_party_id`);
  const reading = `document_extractions?document_id=eq.${seededContract}&status=eq.accepted`;
  const [accepted] = await serviceGet<{ accepted_fields: Record<string, object> }[]>(page, `${reading}&select=accepted_fields`);
  await servicePatch(page, reading, { accepted_fields: { ...accepted?.accepted_fields, tenant_phone: { ...accepted?.accepted_fields.tenant_phone, value: '+84 903 123 456' } } });
  await servicePatch(page, `documents?id=eq.${seededContract}`, { lease_id: null });

  await page.goto(newLeaseFrom(seededContract));
  await expect(page.getByTestId('form-loading')).toHaveCount(0);
  await expect(page.getByTestId('from-contract-intro')).toBeVisible();
  await expect(page.locator('#lease-tenant')).toHaveValue(lease?.tenant_party_id ?? 'missing');
  await expect(page.locator('#tenant-name'), 'the quick add stays closed for a tenant on file').toHaveCount(0);
});
