import { clockAt, parseInstant } from '@esta/core';
import type { Database } from '@esta/db';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

// `pnpm test:integration` (scripts/web-integration.ts) runs this file last, against a fresh `pnpm db:reset`: it moves
// every household's invoices on to 31/12/2026.
const { ESTA_IT_SUPABASE_URL: url, ESTA_IT_SERVICE_ROLE_KEY: serviceRoleKey } = z
  .object({ ESTA_IT_SUPABASE_URL: z.url(), ESTA_IT_SERVICE_ROLE_KEY: z.string().min(1) })
  .parse(process.env);
const SECRET = 'cron-integration-secret';
const HOUSEHOLDS = 11;

let frozenNow = '2026-10-07T09:00:00+07:00';
process.env.SUPABASE_SERVICE_ROLE_KEY = serviceRoleKey;
vi.mock('server-only', () => ({}));
vi.mock('@/server/env', () => ({ env: { CRON_SECRET: SECRET, NEXT_PUBLIC_SUPABASE_URL: url } }));
vi.mock('@/server/clock', () => ({
  readRequestClock: async () => clockAt({ kind: 'table', now: parseInstant(frozenNow) }, 'Asia/Ho_Chi_Minh'),
}));

const invoicesRoute = await import('@/app/api/cron/invoices/route');
const leaseStatusRoute = await import('@/app/api/cron/lease-status/route');

/** Fixture writes name their own actor, so the audit check below sees only what the cron wrote. */
const db: SupabaseClient<Database> = createClient<Database>(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { 'x-esta-actor': 'system:integration-test' } },
});

const authorized = (path: string) => new Request(`http://localhost${path}`, { headers: { authorization: `Bearer ${SECRET}` } });

async function cron(at: string) {
  frozenNow = at;
  const leaseStatus: unknown = await (await leaseStatusRoute.GET(authorized('/api/cron/lease-status'))).json();
  const invoices: unknown = await (await invoicesRoute.GET(authorized('/api/cron/invoices'))).json();
  return { leaseStatus, invoices };
}

async function rows<T>(query: PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function count(query: PromiseLike<{ count: number | null; error: { message: string } | null }>): Promise<number> {
  const { count: found, error } = await query;
  if (error || found === null) throw new Error(error?.message ?? 'no count');
  return found;
}

const counts = async () => ({
  total: await count(db.from('invoices').select('*', { count: 'exact', head: true })),
  issued: await count(db.from('invoices').select('*', { count: 'exact', head: true }).eq('status', 'issued')),
});

async function leaseIdsOf(code: string): Promise<string[]> {
  const properties = await rows(db.from('properties').select('id').eq('code', code));
  return (await rows(db.from('leases').select('id').in('property_id', properties.map((property) => property.id)))).map((lease) => lease.id);
}

const statuses = async () => new Map((await rows(db.from('leases').select('id, status, end_date'))).map((lease) => [lease.id, lease]));

describe('the nightly cron routes against local Supabase (SPEC §5.4, §7.4, LSE-2, LSE-3, LSE-5)', () => {
  it('refuses both routes without the secret or with a wrong one, by GET and by POST', async () => {
    for (const route of [invoicesRoute, leaseStatusRoute]) {
      for (const handler of [route.GET, route.POST]) {
        expect((await handler(new Request('http://localhost/api/cron', { method: 'POST' }))).status).toBe(401);
        expect((await handler(new Request('http://localhost/api/cron', { headers: { authorization: `Bearer ${SECRET}x` } }))).status).toBe(401);
      }
    }
  });

  it('changes nothing at the seed date 07/10/2026, because the seed already holds every invoice the cron would write', async () => {
    const before = await counts();
    expect(await cron('2026-10-07T09:00:00+07:00')).toEqual({
      leaseStatus: { ok: true, as_of: '2026-10-07', ended: 0 },
      invoices: { ok: true, as_of: '2026-10-07', drafted: 0, issued: 0, households: HOUSEHOLDS },
    });
    expect(await counts()).toEqual(before);
  });

  it('on 02/11/2026 ends each Thủ Đức lease, drafts Dĩ An from 25/11 and issues Thủ Đức 01/11, then a second run does nothing', async () => {
    const [latestAudit] = await rows(db.from('audit_log').select('id').order('id', { ascending: false }).limit(1));
    const leasesBefore = await statuses();
    const before = await counts();

    const first = await cron('2026-11-02T00:30:00+07:00');
    const after = await counts();
    expect(first).toEqual({
      leaseStatus: { ok: true, as_of: '2026-11-02', ended: HOUSEHOLDS },
      invoices: { ok: true, as_of: '2026-11-02', drafted: after.total - before.total, issued: after.issued - before.issued, households: HOUSEHOLDS },
    });

    const thuDuc = new Set(await leaseIdsOf('THUDUC'));
    const changed = [...(await statuses())].filter(([id, lease]) => leasesBefore.get(id)?.status !== lease.status);
    expect(changed.map(([id, lease]) => [thuDuc.has(id), lease.status])).toEqual(Array.from({ length: HOUSEHOLDS }, () => [true, 'ended']));

    const thuDucNovember = await rows(db.from('invoices').select('status, issued_at').in('lease_id', [...thuDuc]).eq('period_start', '2026-11-01'));
    expect(thuDucNovember).toEqual(Array.from({ length: HOUSEHOLDS }, () => ({ status: 'issued', issued_at: '2026-11-01T17:30:00+00:00' })));

    const diAn = await rows(
      db.from('invoices').select('status, invoice_lines(kind, amount_vnd)').in('lease_id', await leaseIdsOf('DIAN')).eq('period_start', '2026-11-25'),
    );
    expect(diAn).toHaveLength(6 * HOUSEHOLDS);
    for (const invoice of diAn) {
      expect(invoice.status, 'October readings are missing, so the period waits for its due date').toBe('draft');
      expect(invoice.invoice_lines.map((line) => line.kind)).toEqual(['rent']);
    }

    const written = await rows(db.from('audit_log').select('table_name, actor_kind, actor_id').gt('id', latestAudit?.id ?? 0));
    expect(written.length).toBeGreaterThan(HOUSEHOLDS);
    expect(new Set(written.map((row) => `${row.actor_kind}:${row.actor_id}`))).toEqual(new Set(['system:cron']));

    expect(await cron('2026-11-02T09:00:00+07:00')).toEqual({
      leaseStatus: { ok: true, as_of: '2026-11-02', ended: 0 },
      invoices: { ok: true, as_of: '2026-11-02', drafted: 0, issued: 0, households: HOUSEHOLDS },
    });
    expect(await counts()).toEqual(after);
  });

  it('on 31/12/2026 drafts Q7 from 01/01/2027 and nothing for a period Q7 already paid through', async () => {
    const q7 = await leaseIdsOf('Q7');
    const before = new Set((await rows(db.from('invoices').select('id').in('lease_id', q7))).map((invoice) => invoice.id));
    await cron('2026-12-31T09:00:00+07:00');
    const after = await rows(db.from('invoices').select('id, period_start, period_end, status').in('lease_id', q7));
    const added = after.filter((invoice) => !before.has(invoice.id)).map(({ id: _id, ...invoice }) => invoice);
    expect(added).toEqual(Array.from({ length: HOUSEHOLDS }, () => ({ period_start: '2027-01-01', period_end: '2027-03-31', status: 'draft' })));
  });
});
