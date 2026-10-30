import { expect, type Page } from '@playwright/test';
import { seedId } from '../../supabase/seed/generator/ids.ts';
import { memberRest } from './auth-api';
import { laneHousehold, laneProperty } from './seed';
import { serviceDelete, serviceUpsert } from './wizard';

export const laneNotes = (lane: number) => ({
  overdue: { id: seedId(`seed:agent-item:W1-lane-${lane}`), title: 'Phòng 5 Dãy trọ Dĩ An quá hạn 11 ngày' },
  leaseEnding: { id: seedId(`seed:agent-item:W3-lane-${lane}`), title: 'Hợp đồng Căn hộ Thủ Đức hết hạn sau 26 ngày' },
  watch: { id: seedId(`seed:agent-item:watch-lane-${lane}`), title: 'Ba việc cần để ý' },
});

export const laneOperatorNote = (lane: number) => ({ id: seedId(`e2e:agent-item:operator-lane-${lane}`), title: 'Trợ lý cần Ryan đăng nhập lại Demo' });

export async function addOperatorNote(page: Page, lane: number) {
  const { id, title } = laneOperatorNote(lane);
  await serviceUpsert(page, 'agent_items', {
    id,
    household_id: laneHousehold(lane),
    kind: 'system',
    severity: 'action',
    audience: 'operator',
    title,
    body_md: 'Phiên đăng nhập của Trợ lý đã hết hạn.',
    status: 'new',
    dedupe_key: `e2e:operator-note:lane-${lane}`,
    created_at: '2026-10-07T07:01:00+07:00',
  });
}

export const answer = (page: Page) => page.getByTestId('answer').last();
export const noteCard = (page: Page, title: string) => page.getByTestId('inbox-item').filter({ has: page.getByRole('heading', { name: title, exact: true }) });

export async function incomeIn(page: Page, lane: number, month: '08' | '09' | '10') {
  const last = month === '09' ? '30' : '31';
  const rows = await memberRest<{ amount_vnd: number }[]>(page, 'GET', `allocation_facts?property_id=eq.${laneProperty(lane, 'di-an')}&received_on=gte.2026-${month}-01&received_on=lte.2026-${month}-${last}&select=amount_vnd`);
  return rows.reduce((total, row) => total + row.amount_vnd, 0);
}

type StoredConversation = { readonly id: string; readonly sdk_session_id: string | null };

/** The conversation that holds her latest message, as she reads it under RLS. */
export async function latestConversation(page: Page): Promise<StoredConversation> {
  const [message] = await memberRest<{ conversation_id: string }[]>(page, 'GET', 'messages?role=eq.user&select=conversation_id&order=created_at.desc&limit=1');
  const [row] = await memberRest<StoredConversation[]>(page, 'GET', `conversations?id=eq.${message?.conversation_id ?? ''}&select=id,sdk_session_id`);
  expect(row, 'she reads the conversation she started').toBeDefined();
  return row as StoredConversation;
}

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

export const pinnedRow = (page: Page, title: string) => page.getByTestId('pinned-item').filter({ has: page.getByTestId('pinned-title').getByText(title, { exact: true }) });

export async function pinnedArea(page: Page) {
  const band = page.getByTestId('pinned');
  const [box, open, viewport] = [await band.boundingBox(), await band.locator('details').evaluate((details: HTMLDetailsElement) => details.open), page.viewportSize()];
  return { share: (box?.height ?? 0) / (viewport?.height ?? 1), open };
}
