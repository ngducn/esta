import { expect, test, type Page } from '@playwright/test';
import { seedId } from '../supabase/seed/generator/ids.ts';
import { laneHousehold } from './helpers/seed';
import { setClock } from './helpers/test-clock';
import { open, PHONE, serviceGet, servicePatch, serviceUpsert, seriousAxeViolations, toast, vnd } from './helpers/wizard';

// The test clock is one per slot, so this spec runs in the `clock` project, one test at a time.
test.describe.configure({ mode: 'serial' });

const LANE = 9;
const ME = `me.lane${LANE}@demo.esta.test`;
const RYAN = `ryan.lane${LANE}@demo.esta.test`;
const NOTES = {
  overdue: { id: seedId(`seed:agent-item:W1-lane-${LANE}`), title: 'Phòng 5 Dãy trọ Dĩ An quá hạn 12 ngày' },
  leaseEnding: { id: seedId(`seed:agent-item:W3-lane-${LANE}`), title: 'Hợp đồng Căn hộ Thủ Đức hết hạn sau 25 ngày' },
  watch: { id: seedId(`seed:agent-item:watch-lane-${LANE}`), title: 'Ba việc cần để ý' },
};
const OPERATOR_NOTE = { id: seedId(`e2e:agent-item:operator-lane-${LANE}`), title: 'Trợ lý cần Ryan đăng nhập lại Demo' };

const note = (page: Page, title: string) => page.getByTestId('inbox-item').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
const statusOf = async (page: Page, id: string) => (await serviceGet<{ status: string }[]>(page, `agent_items?id=eq.${id}&select=status`))[0]?.status;

test.beforeEach(async ({ page, request }) => {
  await setClock(request, '2026-10-07T07:05:00+07:00');
  await servicePatch(page, `agent_items?id=in.(${Object.values(NOTES).map(({ id }) => id).join(',')})`, { status: 'new' });
});

test.afterAll(async ({ request }) => {
  await setClock(request, null);
});

test('Mẹ reads the overdue note, marks it read, hides the grouped note, undoes it and hides it for good', async ({ page }) => {
  await open(page, ME, 'light', PHONE);
  await page.goto('/assistant');

  const seeded = page.getByTestId('inbox-item').filter({ has: page.getByRole('heading', { name: new RegExp(Object.values(NOTES).map(({ title }) => title).join('|')) }) });
  await expect(seeded.getByRole('heading', { level: 3 }), 'the watch notes are newest first').toHaveText(Object.values(NOTES).map(({ title }) => title));

  const overdue = note(page, NOTES.overdue.title);
  await expect(overdue).toContainText('Hoàng Văn Em Demo');
  await expect(overdue).toContainText('25/09/2026');
  await expect(overdue).toContainText(vnd('2.800.000'));
  await expect(overdue.locator('time')).toHaveText('06:45');
  await expect(overdue.getByTestId('note-unread')).toHaveText('Mới');

  await overdue.getByRole('button', { name: `Đánh dấu đã đọc: ${NOTES.overdue.title}` }).click();
  await expect(overdue).toHaveAttribute('data-status', 'read');
  await expect(overdue.getByTestId('note-unread'), 'a read note drops the dot and the word Mới').toHaveCount(0);
  await expect(overdue.getByTestId('note-read')).toHaveCount(0);
  expect(await statusOf(page, NOTES.overdue.id)).toBe('read');
  expect(await seriousAxeViolations(page)).toEqual([]);

  const watch = note(page, NOTES.watch.title);
  await watch.getByTestId('note-dismiss').click();
  await expect(watch).toHaveCount(0);
  await expect(toast(page)).toContainText('Đã ẩn ghi chú.');
  await toast(page).getByRole('button', { name: 'Hoàn tác' }).click();
  await expect(watch, 'Hoàn tác puts the note back as it was, unread').toHaveAttribute('data-status', 'new');
  await expect(watch.getByTestId('note-unread')).toBeVisible();
  expect(await statusOf(page, NOTES.watch.id)).toBe('new');

  await watch.getByTestId('note-dismiss').click();
  await expect(watch).toHaveCount(0);
  await expect.poll(() => statusOf(page, NOTES.watch.id)).toBe('dismissed');
  await page.reload();
  await expect(note(page, NOTES.leaseEnding.title)).toBeVisible();
  await expect(watch, 'a hidden note stays hidden after a reload').toHaveCount(0);
});

test('an operator note reaches Ryan with its pill and never Mẹ', async ({ page }) => {
  await serviceUpsert(page, 'agent_items', {
    id: OPERATOR_NOTE.id,
    household_id: laneHousehold(LANE),
    kind: 'system',
    severity: 'info',
    audience: 'operator',
    title: OPERATOR_NOTE.title,
    body_md: 'Phiên đăng nhập của Trợ lý đã hết hạn.',
    status: 'new',
    dedupe_key: `e2e:operator-note:lane-${LANE}`,
    created_at: '2026-10-07T07:00:00+07:00',
  });

  await open(page, ME, 'light', PHONE);
  await page.goto('/assistant');
  await expect(note(page, NOTES.overdue.title)).toBeVisible();
  await expect(note(page, OPERATOR_NOTE.title), 'RLS keeps an operator note from a member').toHaveCount(0);

  await page.context().clearCookies();
  await open(page, RYAN, 'light', PHONE);
  await page.goto('/assistant');
  const operatorNote = note(page, OPERATOR_NOTE.title);
  await expect(operatorNote).toBeVisible();
  await expect(operatorNote.getByTestId('note-operator')).toHaveText('Chỉ người vận hành');
  await expect(operatorNote.locator('time')).toHaveText('07:00');
});
