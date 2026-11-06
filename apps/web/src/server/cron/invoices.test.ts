import { clockAt, parseInstant } from '@esta/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CronClient } from './supabase';

vi.mock('server-only', () => ({}));
vi.mock('../env', () => ({ env: { CRON_SECRET: 'secret' } }));
vi.mock('../clock', () => ({ readRequestClock: async () => clock }));
vi.mock('./supabase', () => ({ cronClient: () => route.client }));
const route: { client?: CronClient } = {};
const { runInvoices, invoicesCron } = await import('./invoices');

const clock = clockAt({ kind: 'table', now: parseInstant('2026-10-07T09:00:00+07:00') }, 'Asia/Ho_Chi_Minh');
const HOUSEHOLDS = ['h-1', 'h-2', 'h-3', 'h-4'];

function client(failing: Readonly<Record<string, string>>): { readonly client: CronClient; readonly billed: string[] } {
  const billed: string[] = [];
  const fake = {
    from: () => ({ select: () => ({ order: () => Promise.resolve({ data: HOUSEHOLDS.map((id) => ({ id })), error: null }) }) }),
    rpc: (_name: string, args: { p_household_id: string }) => ({
      single: () => {
        const id = args.p_household_id;
        if (failing[id] !== undefined) return Promise.resolve({ data: null, error: { message: failing[id] } });
        billed.push(id);
        return Promise.resolve({ data: { drafted: 2, issued: 1 }, error: null });
      },
    }),
  };
  return { client: fake as unknown as CronClient, billed };
}

afterEach(() => vi.restoreAllMocks());

describe('runInvoices', () => {
  it('bills every household when none fails', async () => {
    const { client: db, billed } = client({});
    expect(await runInvoices(db, clock)).toEqual({ ok: true, as_of: '2026-10-07', drafted: 8, issued: 4, households: 4, failed: [] });
    expect(billed).toEqual(HOUSEHOLDS);
  });

  it('keeps billing the households after one that fails, and names the failure by household (#145, #250)', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { client: db, billed } = client({ 'h-2': 'invoice_lines_amount_vnd_check' });
    const run = await runInvoices(db, clock);
    expect(billed).toEqual(['h-1', 'h-3', 'h-4']);
    expect(run).toEqual({ ok: false, as_of: '2026-10-07', drafted: 6, issued: 3, households: 4, failed: [{ household_id: 'h-2', error: 'invoice_lines_amount_vnd_check' }] });
    expect(log).toHaveBeenCalledWith(expect.stringContaining('h-2'));
  });

  it('records every failing household, not only the first', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const run = await runInvoices(client({ 'h-1': 'a', 'h-4': 'b' }).client, clock);
    expect(run.failed.map((failure) => failure.household_id)).toEqual(['h-1', 'h-4']);
    expect(run.drafted).toBe(4);
  });
});

describe('the invoices cron route', () => {
  it('answers 500 with the summary when a household failed, so the scheduler reports the run as failed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    route.client = client({ 'h-3': 'boom' }).client;
    const response = await invoicesCron(new Request('http://localhost/api/cron/invoices', { headers: { authorization: 'Bearer secret' } }));
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ ok: false, failed: [{ household_id: 'h-3' }], households: 4 });
  });

  it('answers 200 when every household billed', async () => {
    route.client = client({}).client;
    const response = await invoicesCron(new Request('http://localhost/api/cron/invoices', { headers: { authorization: 'Bearer secret' } }));
    expect(response.status).toBe(200);
  });
});
