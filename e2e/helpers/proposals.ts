import { test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { laneHousehold } from './seed';
import { setClock } from './test-clock';
import { servicePatch, serviceUpsert } from './wizard';

export type TaskProposal = { readonly id: string; readonly title: string };

/**
 * A `create_task` proposal as `create_proposal` stores it, under a fresh id, key and title, so every run approves a
 * new one and never finds the card an earlier run decided on the same clock day.
 */
export async function seedTaskProposal(page: Page, lane: number, params: { title: string; dueOn: string | null; propertyId?: string | null }): Promise<TaskProposal> {
  const id = randomUUID();
  const title = `${params.title} ${id.slice(0, 6)}`;
  await serviceUpsert(page, 'agent_items', {
    id,
    household_id: laneHousehold(lane),
    kind: 'proposal',
    severity: 'info',
    title,
    body_md: 'Trợ lý đề xuất việc này cho hôm nay.',
    proposal: { type: 'create_task', params: { title, due_on: params.dueOn, property_id: params.propertyId ?? null, lease_id: null } },
    dedupe_key: `e2e:proposal:${id}`,
  });
  return { id, title };
}

export const proposalCard = (page: Page, title: string) => page.getByTestId('inbox-item').filter({ has: page.getByRole('heading', { name: title, exact: true }) });

/**
 * Runs a spec's tests at 07:05 on SPEC §9.3's day, and afterwards closes the tasks its approvals left open in the
 * lane, so no later spec finds them on Home.
 */
export function proposalLane(lane: number): void {
  test.describe.configure({ mode: 'serial' });
  test.beforeEach(async ({ request }) => {
    await setClock(request, '2026-10-07T07:05:00+07:00');
  });
  test.afterAll(async ({ browser, request }) => {
    const page = await browser.newPage();
    await servicePatch(page, `tasks?household_id=eq.${laneHousehold(lane)}&source=eq.agent_proposal&status=eq.open`, { status: 'done' });
    await page.close();
    await setClock(request, null);
  });
}
