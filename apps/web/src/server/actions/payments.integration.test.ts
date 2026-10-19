import { allocatePayment, owedFor, type OpenInvoice } from '@esta/core/allocation';
import { isoDate } from '@esta/core/date';
import { vnd } from '@esta/core/money';
import type { Database } from '@esta/db';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { PaymentInput } from './payments';

// `pnpm test:integration` (scripts/web-integration.ts) passes the slot's stack and sets its database clock to
// 2026-10-07; run against a fresh `pnpm db:reset`. Every payment recorded here is undone, so the seed stays as it was.
const { ESTA_IT_SUPABASE_URL: url, ESTA_IT_ANON_KEY: anonKey, ESTA_IT_MAILBOX: mailbox } = z
  .object({ ESTA_IT_SUPABASE_URL: z.url(), ESTA_IT_ANON_KEY: z.string().min(1), ESTA_IT_MAILBOX: z.url() })
  .parse(process.env);
const EMAIL = 'ryan.lane9@demo.esta.test';
const client: SupabaseClient<Database> = createClient<Database>(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const search = new URLSearchParams({ query: `to:"${EMAIL}"` }).toString();

async function latestCode(): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const found = z.object({ messages: z.array(z.object({ ID: z.string() })) }).parse(await (await fetch(`${mailbox}/search?${search}`)).json());
    const [newest] = found.messages;
    if (newest !== undefined) {
      const { Text } = z.object({ Text: z.string() }).parse(await (await fetch(`${mailbox}/message/${newest.ID}`)).json());
      const code = /\b\d{6}\b/.exec(Text)?.[0];
      if (code !== undefined) return code;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No sign-in code reached ${EMAIL}`);
}

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
vi.mock('@/server/member', () => ({ requireMember: async () => ({ household: { id: 'unused' } }) }));
vi.mock('@/server/supabase/server', () => ({ createSessionClient: async () => client }));

const { recordPayment, undoPayment } = await import('./payments');

const balanceSchema = z.object({ id: z.uuid(), number: z.string(), lease_id: z.uuid(), due_date: z.string(), period_start: z.string(), outstanding_vnd: z.number() });

/** The seeded lane household's open invoices, read under RLS as the member records them. */
type Sheet = { leaseId: string; invoiceId: string; open: OpenInvoice[] };

/** Invoice numbers follow the order the nightly job drafts in, so a Dĩ An room's invoice is found by its room and month. */
async function openInvoices(room: string, month: string): Promise<Sheet> {
  const property = await client.from('properties').select('id').eq('code', 'DIAN').single();
  if (property.error) throw property.error;
  const unit = await client.from('units').select('id').eq('property_id', property.data.id).eq('label', room).single();
  if (unit.error) throw unit.error;
  const lease = await client.from('leases').select('id').eq('unit_id', unit.data.id).eq('status', 'active').single();
  if (lease.error) throw lease.error;
  const { data, error } = await client.from('invoice_balances').select('id, number, lease_id, due_date, period_start, outstanding_vnd').eq('status', 'issued').gt('outstanding_vnd', 0);
  if (error) throw error;
  const rows = z.array(balanceSchema).parse(data);
  const row = rows.find((candidate) => candidate.lease_id === lease.data.id && candidate.period_start.startsWith(month));
  if (row === undefined) throw new Error(`${room} ${month} is not open`);
  const open = rows
    .filter((candidate) => candidate.lease_id === row.lease_id)
    .map((candidate) => ({ id: candidate.id, dueDate: isoDate(candidate.due_date), periodStart: isoDate(candidate.period_start), outstandingVnd: vnd(candidate.outstanding_vnd) }));
  return { leaseId: row.lease_id, invoiceId: row.id, open };
}

async function allocationsOf(paymentId: string) {
  const { data, error } = await client.from('payment_allocations').select('invoice_id, amount_vnd').eq('payment_id', paymentId);
  if (error) throw error;
  return data.map((row) => ({ invoiceId: row.invoice_id, amountVnd: row.amount_vnd })).toSorted((a, b) => a.invoiceId.localeCompare(b.invoiceId));
}

/** Amounts from a fixed seed, so a failing case reruns as it failed. */
function generatedAmounts(count: number, seed: number): number[] {
  let state = seed;
  return Array.from({ length: count }, () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return 1 + (state % 9_000_000);
  });
}

/** What a sheet opened on `sheet` sends: its row, and what it saw owed for the invoices it settles. */
const input = (sheet: Sheet, amount: string, invoiceIds: string[] | null = null, receivedOn = '07/10/2026'): PaymentInput => ({
  invoiceId: sheet.invoiceId,
  owedVnd: owedFor(sheet.open, sheet.invoiceId, invoiceIds),
  amount,
  method: 'bank_transfer',
  receivedOn,
  idempotencyKey: crypto.randomUUID(),
  invoiceIds,
});

async function record(raw: PaymentInput) {
  const result = await recordPayment(raw);
  if (!result.ok) throw new Error(result.reason);
  return result.payment;
}

async function undo(paymentId: string) {
  expect(await undoPayment(paymentId)).toEqual({ ok: true });
}

beforeAll(async () => {
  await fetch(`${mailbox}/search?${search}`, { method: 'DELETE' });
  const sent = await client.auth.signInWithOtp({ email: EMAIL, options: { shouldCreateUser: false } });
  if (sent.error) throw sent.error;
  const verified = await client.auth.verifyOtp({ email: EMAIL, token: await latestCode(), type: 'email' });
  if (verified.error) throw verified.error;
}, 30_000);

describe('payment actions against local Supabase (LSE-7)', () => {
  it('records a full cash payment on Phòng 3, which reads paid, and undo removes it with its allocation', async () => {
    const sheet = await openInvoices('Phòng 3', '2026-10');
    const { invoiceId } = sheet;
    const payment = await record({ ...input(sheet, '2.500.000'), method: 'cash' });
    expect(payment).toMatchObject({ amountVnd: 2_500_000, allocatedVnd: 2_500_000 });
    const { data } = await client.from('invoice_balances').select('payment_status').eq('id', invoiceId).single();
    expect(data?.payment_status).toBe('paid');
    await undo(payment.id);
    expect(await undoPayment(payment.id), 'a second undo changes nothing').toEqual({ ok: true });
    expect(await allocationsOf(payment.id)).toEqual([]);
    const after = await client.from('invoice_balances').select('payment_status').eq('id', invoiceId).single();
    expect(after.data?.payment_status).toBe('unpaid');
  });

  it('records 3tr5 as a partial transfer and an overpayment with the rest left as credit', async () => {
    const sheet = await openInvoices('Phòng 5', '2026-10');
    const partial = await record(input(sheet, '3tr5'));
    expect(partial).toMatchObject({ amountVnd: 3_500_000, allocatedVnd: 3_500_000 });
    await undo(partial.id);
    const over = await record(input(sheet, '7tr'));
    expect(over, 'September and October settle, 1.400.000 is credit').toMatchObject({ amountVnd: 7_000_000, allocatedVnd: 5_600_000 });
    await undo(over.id);
  });

  it('returns the same payment for a repeated key and writes one', async () => {
    const raw = input(await openInvoices('Phòng 6', '2026-10'), '2tr8');
    const [first, second] = await Promise.all([record(raw), record(raw)]);
    expect(second.id).toBe(first.id);
    const { count } = await client.from('payments').select('id', { count: 'exact', head: true }).eq('idempotency_key', raw.idempotencyKey);
    expect(count).toBe(1);
    await undo(first.id);
  });

  it('refuses a sheet left open on Phòng 5 September once that row is recorded elsewhere, so October stays owed', async () => {
    const stale = await openInvoices('Phòng 5', '2026-09');
    const october = await openInvoices('Phòng 5', '2026-10');
    const elsewhere = await record(input(await openInvoices('Phòng 5', '2026-09'), '2.800.000'));
    const before = await client.from('payments').select('id', { count: 'exact', head: true });
    expect(await recordPayment(input(stale, '2.800.000')), 'the row is paid').toEqual({ ok: false, reason: 'stale' });
    expect(await recordPayment(input(stale, '2.800.000', [stale.invoiceId])), 'the chosen September is paid').toEqual({ ok: false, reason: 'stale' });
    const after = await client.from('payments').select('id', { count: 'exact', head: true });
    expect(after.count).toBe(before.count);
    const { data } = await client.from('invoice_balances').select('payment_status').eq('id', october.invoiceId).single();
    expect(data?.payment_status).toBe('unpaid');
    const chosen = await record(input(stale, '2.800.000', [october.invoiceId]));
    expect(chosen, 'a choice of October, which nobody touched, still records').toMatchObject({ allocatedVnd: 2_800_000 });
    await undo(chosen.id);
    await undo(elsewhere.id);
  });

  it('refuses an unreadable amount, an impossible date and a date after the clock, writing nothing', async () => {
    const sheet = await openInvoices('Phòng 4', '2026-10');
    const before = await client.from('payments').select('id', { count: 'exact', head: true });
    expect(await recordPayment(input(sheet, '3tr5x'))).toEqual({ ok: false, reason: 'amount' });
    expect(await recordPayment(input(sheet, ''))).toEqual({ ok: false, reason: 'amount' });
    expect(await recordPayment(input(sheet, '2tr5', null, '31/09/2026'))).toEqual({ ok: false, reason: 'date' });
    expect(await recordPayment(input(sheet, '2tr5', null, ''))).toEqual({ ok: false, reason: 'date' });
    expect(await recordPayment(input(sheet, '2tr5', null, '08/10/2026'))).toEqual({ ok: false, reason: 'dateAfterToday' });
    expect(await recordPayment(input(sheet, '2tr5', []))).toEqual({ ok: false, reason: 'choice' });
    const after = await client.from('payments').select('id', { count: 'exact', head: true });
    expect(after.count).toBe(before.count);
  });

  it('allocates exactly what packages/core allocatePayment plans, to the đồng, over generated amounts and invoice choices', async () => {
    const amounts = generatedAmounts(12, 20261007);
    const edges = [1, 2_799_999, 2_800_000, 2_800_001, 5_599_999, 5_600_000, 5_600_001];
    let compared = 0;
    for (const start of [0, 1_000_000, 2_800_000]) {
      const seeded = await openInvoices('Phòng 5', '2026-10');
      const setup = start === 0 ? null : await record(input(seeded, String(start)));
      const sheet = await openInvoices('Phòng 5', '2026-10');
      const { open } = sheet;
      const choices = [null, ...open.map((invoice) => [invoice.id]), ...(open.length > 1 ? [open.map((invoice) => invoice.id)] : [])];
      for (const amount of [...edges, ...amounts]) {
        for (const choice of choices) {
          const pool = choice === null ? open : open.filter((invoice) => choice.includes(invoice.id));
          const plan = allocatePayment(vnd(amount), pool);
          if (!plan.ok) throw new Error(plan.reason);
          const payment = await record(input(sheet, String(amount), choice));
          const expected = plan.value.allocations.map((part) => ({ invoiceId: part.invoiceId, amountVnd: part.amountVnd })).toSorted((a, b) => a.invoiceId.localeCompare(b.invoiceId));
          expect(await allocationsOf(payment.id), JSON.stringify({ start, amount, choice })).toEqual(expected);
          expect(amount - payment.allocatedVnd).toBe(plan.value.creditVnd);
          await undo(payment.id);
          compared += 1;
        }
      }
      if (setup !== null) await undo(setup.id);
      expect((await openInvoices('Phòng 5', '2026-10')).open).toEqual(seeded.open);
    }
    expect(compared).toBeGreaterThan(100);
  }, 120_000);
});
