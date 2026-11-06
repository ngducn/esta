import { expect, type Locator, type Page } from '@playwright/test';
import { join } from 'node:path';
import { memberRest } from './auth-api';
import { laneHousehold } from './seed';
import { serviceGet, vnd } from './wizard';

/** Hand-written recordings of the three morning jobs, whose prompts name 2026-10-08 and whose handles follow this household's facts. */
export const NORTHSTAR_REPLAY = join(import.meta.dirname, '..', '..', 'fixtures', 'agent-replay', 'northstar');

/** Waits until the worker, woken at 2026-10-08 07:05, has backfilled the day's three jobs: queued in schedule order, since the frozen clock gives every finish the same time. */
export async function waitForMorningJobs(page: Page) {
  const jobs = `agent_jobs?household_id=eq.${laneHousehold(1)}&kind=in.(research_scan,portfolio_watch,morning_brief)&idempotency_key=like.*:2026-10-08&select=kind,status&order=run_after`;
  await expect
    .poll(async () => (await serviceGet<{ kind: string; status: string }[]>(page, jobs)).filter((job) => job.status === 'done').map((job) => job.kind), { timeout: 90_000, intervals: [500] })
    .toEqual(['research_scan', 'portfolio_watch', 'morning_brief']);
}

/** The same brief on Home, as its summary line and the time it ran. */
export async function expectMorningHome(page: Page) {
  const home = page.getByTestId('home-brief');
  await expect(home.getByTestId('home-brief-summary')).toHaveText('Hôm nay cần hỏi gia hạn Căn hộ Thủ Đức và Phòng 3 Dãy trọ Dĩ An, và nhắc tiền thuê Phòng 6 Dãy trọ Dĩ An.');
  await expect(home.getByTestId('home-brief-ran')).toHaveText('Trợ lý chạy lúc 07:05.');
}

/** North-star step 7 as Mẹ reads it in the thread: the ending leases to do, the unpaid room to watch and one market item with its source. */
export async function expectMorningBrief(page: Page) {
  const brief = page.locator('[data-testid="inbox-item"][data-kind="brief"]');
  await expect(brief, 'the day’s one brief').toHaveCount(1);
  const lists = brief.getByRole('list');
  await expect(lists.first().getByRole('listitem')).toHaveText([
    'Hợp đồng Căn hộ Thủ Đức hết hạn ngày 01/11/2026, còn 24 ngày',
    'Hợp đồng Phòng 3 Dãy trọ Dĩ An hết hạn ngày 07/11/2026, còn 30 ngày',
  ]);
  await expect(lists.nth(1).getByRole('listitem').first()).toHaveText(`Phòng 6 Dãy trọ Dĩ An quá hạn 7 ngày, còn nợ ${vnd('2.800.000')}`);
  const market = lists.last().getByRole('listitem');
  await expect(market).toHaveCount(1);
  await expect(market.getByTestId('citation-chip')).toHaveText('Tin tức Demo · 05/10/2026');
  await expect(market.getByTestId('citation-chip')).toHaveAttribute('href', /^https:\/\/tintuc\.example\.vn\/ha-tang\/vanh-dai-3-/);
}

/** What a property's ledger received in October 2026, summed from the allocations as the signed-in member reads them. */
async function receivedInOctober(page: Page, nickname: string): Promise<{ propertyId: string; collected: number }> {
  const [property] = await memberRest<{ id: string }[]>(page, 'GET', `properties?nickname=eq.${encodeURIComponent(nickname)}&select=id`);
  const propertyId = property?.id ?? '';
  const rows = await memberRest<{ amount_vnd: number }[]>(page, 'GET', `allocation_facts?property_id=eq.${propertyId}&received_on=gte.2026-10-01&received_on=lte.2026-10-31&select=amount_vnd`);
  return { propertyId, collected: rows.reduce((total, row) => total + row.amount_vnd, 0) };
}

/** Step 9: the answer names the October total of steps 5 and 6, and returns the property for the ledger link. */
export async function expectCollected(page: Page, reply: Locator, nickname: string): Promise<string> {
  const { propertyId, collected } = await receivedInOctober(page, nickname);
  expect(collected, 'the statement and the cash payment of steps 5 and 6 are in October').toBe(13_100_000);
  await expect(reply).toContainText(`${nickname} đã thu ${vnd(new Intl.NumberFormat('vi-VN').format(collected))} tiền thuê.`);
  return propertyId;
}
