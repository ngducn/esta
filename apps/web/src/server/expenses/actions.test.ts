import { MAX_AMOUNT_VND } from '@esta/core/money';
import { vndInputText } from '@esta/core/properties/form';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { seedId } from '../../../../../supabase/seed/generator/ids';
import { putSigned, service, signedInAs, stackName, stackUp } from '@/test/stack';

const session = vi.hoisted(() => ({
  client: null as unknown,
  member: { role: 'member', household: { id: '' } },
}));

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
vi.mock('@/server/env', () => ({ env: { ESTA_SIGNED_URL_TTL_SECONDS: 300 } }));
vi.mock('@/server/clock', () => ({ readRequestClock: async () => ({ now: () => '2026-10-07T09:00:00+07:00', today: () => '2026-10-07' }) }));
vi.mock('@/server/member', () => ({ requireMember: async () => session.member }));
vi.mock('@/server/supabase/server', () => ({ createSessionClient: async () => session.client }));

const { saveExpense, deleteExpense, restoreExpense } = await import('./actions');
const { loadExpenseVendors } = await import('./load');
const { createDocumentUpload } = await import('@/server/documents/actions');

const LANE = 6;
const household = seedId(`seed:household:lane-${LANE}`);
const propertyId = seedId(`seed:property:lane-${LANE}:q7`);
const otherHouseholdsExpense = seedId('seed:expense:lane-5:q7:2026-08:1');
const created = { expenses: [] as string[], parties: [] as string[], documents: [] as string[] };

function sheet(amount: string) {
  const id = randomUUID();
  created.expenses.push(id);
  return { id, propertyId, category: 'repair', amount, paidOn: '07/10/2026', vendor: null, receipt: null, note: '' };
}

function newVendor(fullName: string) {
  const vendor = { kind: 'new', id: randomUUID(), fullName };
  created.parties.push(vendor.id);
  return vendor;
}

/** A receipt photo sent to Storage through its upload ticket, as the sheet sends one, and not yet registered. */
async function sentReceipt() {
  const bytes = randomBytes(2048);
  const file = { filename: 'hoa-don.jpg', mime: 'image/jpeg', size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  const ticket = await createDocumentUpload({ ...file, propertyId, category: 'invoice_receipt' });
  if (!ticket.ok) throw new Error('createDocumentUpload refused');
  created.documents.push(ticket.documentId);
  expect((await putSigned(ticket.file.url, bytes, file.mime)).status).toBe(200);
  return { kind: 'new', documentId: ticket.documentId, ...file, pageCount: 1, title: 'Hoá đơn chi phí - Nhà phố Q7' };
}

const rows = (table: string, id: string, select = 'id') => service<unknown[]>(`/rest/v1/${table}?id=eq.${id}&select=${select}`);

describe.skipIf(!stackUp)(`expense actions against ${stackName}`, () => {
  let member: SupabaseClient;

  beforeAll(async () => {
    member = await signedInAs(`ryan.lane${LANE}@demo.esta.test`);
    session.client = member;
    session.member = { role: 'member', household: { id: household } };
  });

  afterAll(async () => {
    const { expenses, parties, documents } = created;
    await service(`/rest/v1/expenses?id=in.(${expenses.join(',')})`, { method: 'DELETE' });
    await service(`/rest/v1/parties?id=in.(${parties.join(',')})`, { method: 'DELETE' });
    await service(`/rest/v1/documents?id=in.(${documents.join(',')})`, { method: 'DELETE' });
    const names = documents.flatMap((id) => ['hoa-don.jpg', 'thumb.webp', 'review.webp'].map((name) => `${household}/${id}/${name}`));
    await service('/storage/v1/object/documents', { method: 'DELETE', body: JSON.stringify({ prefixes: names }) });
  });

  test('a retried save with the same id writes one row, holding what the sheet sent last', async () => {
    const input = sheet('2tr5');
    expect(await saveExpense(input)).toEqual({ ok: true, expense: { id: input.id, amountVnd: 2_500_000 } });
    expect(await saveExpense(input)).toEqual({ ok: true, expense: { id: input.id, amountVnd: 2_500_000 } });
    expect(await saveExpense({ ...input, amount: '3tr' })).toEqual({ ok: true, expense: { id: input.id, amountVnd: 3_000_000 } });
    expect(await rows('expenses', input.id, 'amount_vnd,paid_on,household_id')).toEqual([{ amount_vnd: 3_000_000, paid_on: '2026-10-07', household_id: household }]);
  });

  test('a vendor added in the sheet is saved once, tagged contractor, and the picker offers it next time', async () => {
    const vendor = newVendor('Thợ điện Demo Phường Tân Đông Hiệp');
    const input = { ...sheet('850k'), vendor };
    expect(await saveExpense(input)).toMatchObject({ ok: true });
    expect(await saveExpense(input)).toMatchObject({ ok: true });
    expect(await rows('parties', vendor.id, 'full_name,tags,household_id')).toEqual([{ full_name: vendor.fullName, tags: ['contractor'], household_id: household }]);
    expect(await rows('expenses', input.id, 'vendor_party_id')).toEqual([{ vendor_party_id: vendor.id }]);
    expect(await loadExpenseVendors(household)).toContainEqual({ id: vendor.id, name: vendor.fullName });
  });

  test('saving with a receipt photo files it in Tài liệu as an invoice receipt of the property, linked to the expense', async () => {
    const receipt = await sentReceipt();
    expect(await rows('documents', receipt.documentId)).toEqual([]);
    const input = { ...sheet('1tr2'), receipt };
    expect(await saveExpense(input)).toMatchObject({ ok: true });
    expect(await rows('documents', receipt.documentId, 'category,property_id,title,household_id')).toEqual([
      { category: 'invoice_receipt', property_id: propertyId, title: receipt.title, household_id: household },
    ]);
    expect(await rows('expenses', input.id, 'document_id')).toEqual([{ document_id: receipt.documentId }]);
  });

  test('a refused save leaves no vendor and no receipt behind', async () => {
    const vendor = newVendor('Thợ Demo không lưu được');
    const receipt = await sentReceipt();
    const input = { ...sheet('1tr'), id: otherHouseholdsExpense, vendor, receipt };
    expect(await saveExpense(input)).toEqual({ ok: false, reason: 'failed' });
    expect(await rows('parties', vendor.id)).toEqual([]);
    expect(await rows('documents', receipt.documentId)).toEqual([]);
  });

  test('a receipt that never reached Storage saves nothing', async () => {
    const receipt = { ...(await sentReceipt()), size: 4096 };
    const input = { ...sheet('1tr'), receipt };
    expect(await saveExpense(input)).toEqual({ ok: false, reason: 'failed' });
    expect(await rows('expenses', input.id)).toEqual([]);
    expect(await rows('documents', receipt.documentId)).toEqual([]);
  });

  test('delete sets deleted_at and restore brings the same row back', async () => {
    const input = sheet('1tr2');
    expect(await saveExpense(input)).toMatchObject({ ok: true });
    const listed = async () => (await member.from('expenses').select('id').eq('id', input.id).is('deleted_at', null)).data;
    expect(await deleteExpense(input.id)).toEqual({ ok: true });
    expect(await listed()).toEqual([]);
    expect(await rows('expenses', input.id, 'deleted_at')).toEqual([{ deleted_at: '2026-10-07T02:00:00+00:00' }]);
    expect(await restoreExpense(input.id)).toEqual({ ok: true });
    expect(await listed()).toEqual([{ id: input.id }]);
  });

  test('an amount of 0, or one đồng over the ceiling, is refused on the amount field and writes nothing', async () => {
    const zero = sheet('0');
    const over = sheet(vndInputText(MAX_AMOUNT_VND + 1));
    expect(await saveExpense(zero)).toEqual({ ok: false, reason: 'invalid', problems: { amount: 'not_positive' } });
    expect(await saveExpense(over)).toEqual({ ok: false, reason: 'invalid', problems: { amount: 'too_large' } });
    expect(await rows('expenses', zero.id)).toEqual([]);
    expect(await rows('expenses', over.id)).toEqual([]);
  });

  test('a viewer cannot save an expense', async () => {
    session.member = { role: 'viewer', household: { id: household } };
    try {
      expect(await saveExpense(sheet('500k'))).toEqual({ ok: false, reason: 'forbidden' });
    } finally {
      session.member = { role: 'member', household: { id: household } };
    }
  });
});
