import type { Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { laneHousehold } from './seed';
import { servicePatch, serviceUpsert } from './wizard';

export type TaskProposal = { readonly id: string; readonly title: string };

/** A `create_task` proposal as `create_proposal` stores it, under a fresh id and key, so every run approves a new one. */
export async function seedTaskProposal(page: Page, lane: number, params: { title: string; dueOn: string | null; propertyId?: string | null }): Promise<TaskProposal> {
  const id = randomUUID();
  await serviceUpsert(page, 'agent_items', {
    id,
    household_id: laneHousehold(lane),
    kind: 'proposal',
    severity: 'info',
    title: params.title,
    body_md: 'Trợ lý đề xuất việc này cho hôm nay.',
    proposal: { type: 'create_task', params: { title: params.title, due_on: params.dueOn, property_id: params.propertyId ?? null, lease_id: null } },
    dedupe_key: `e2e:proposal:${id}`,
  });
  return { id, title: params.title };
}

/** Closes the tasks approvals left open in the lane, so no later spec finds them on Home. */
export async function closeApprovedTasks(page: Page, lane: number): Promise<void> {
  await servicePatch(page, `tasks?household_id=eq.${laneHousehold(lane)}&source=eq.agent_proposal&status=eq.open`, { status: 'done' });
}
