import { clockAt, parseInstant } from '@esta/core';
import type { Database } from '@esta/db';
import { createClient } from '@supabase/supabase-js';
import type { Db } from '../db';
import type { DatabaseError } from '../kit';
import type { OpContext } from '../op';
import { leaseRowSchema } from '@esta/core/schemas/lease';
import type { Pending, ViewRows } from '../view';

export type Sent = { readonly method: string; readonly table: string; readonly query: URLSearchParams; readonly body: unknown };

/** `rows` answers each request; `fails` turns one into the error PostgREST sends for a raised exception. */
export function fakeDb(rows: (sent: Sent) => readonly unknown[] = () => [], fails: (sent: Sent) => DatabaseError | null = () => null) {
  const sent: Sent[] = [];
  const db: Db = createClient<Database>('http://fake.test', 'anon', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        const text = typeof init?.body === 'string' ? init.body : '';
        const request: Sent = { method: init?.method ?? 'GET', table: url.pathname.replace('/rest/v1/', ''), query: url.searchParams, body: text === '' ? null : JSON.parse(text) };
        sent.push(request);
        const failure = fails(request);
        if (failure !== null) return new Response(JSON.stringify(failure), { status: 400, headers: { 'content-type': 'application/json' } });
        const single = new Headers(init?.headers).get('Accept')?.includes('vnd.pgrst.object') === true;
        const reply = rows(request);
        return new Response(JSON.stringify(single ? reply[0] : reply), { status: 200, headers: { 'content-type': 'application/json' } });
      },
    },
  });
  return { db, sent };
}

export const HOUSEHOLD = '0b6c1f9e-7d1a-4c55-9a3e-5b0c2d1e0001';

export function opContext(db: Db, pending?: Pending): OpContext {
  const clock = clockAt({ kind: 'env', now: parseInstant('2026-10-07T02:00:00.000Z') }, 'Asia/Ho_Chi_Minh');
  return { db, householdId: HOUSEHOLD, clock, ...(pending === undefined ? {} : { pending }) };
}

export const PROPERTY = '0b6c1f9e-7d1a-4c55-9a3e-5b0c2d1e0002';
export const ROOM = '0b6c1f9e-7d1a-4c55-9a3e-5b0c2d1e0003';
export const TENANT = '0b6c1f9e-7d1a-4c55-9a3e-5b0c2d1e0004';
export const LEASE = '0b6c1f9e-7d1a-4c55-9a3e-5b0c2d1e0005';

/** PostgREST with PROPERTY in the trash: it comes back to any read that does not ask for live properties only. */
export function trashedProperty(rows: (sent: Sent) => readonly unknown[] = () => []) {
  return (sent: Sent): readonly unknown[] => {
    if (sent.table !== 'properties') return rows(sent);
    return sent.query.get('deleted_at') === 'is.null' ? [] : [{ id: PROPERTY, nickname: 'Demo Nhà Q1' }];
  };
}

/** Chị Lan Demo's room from 2026-03-01 at 9,000,000 a month with two months' deposit, as the lease form sends it. */
export const demoDraft = {
  unit_id: ROOM,
  tenant_party_id: TENANT,
  start_date: '2026-03-01',
  end_date: null,
  rent_vnd: 9_000_000,
  billing_cycle_months: 1,
  period_anchor: 'lease_start',
  first_period_proration: 'by_days',
  deposit_vnd: 18_000_000,
  escalation: { kind: 'none' },
  utilities_mode: 'metered_by_owner',
  tax_payer: 'owner',
  notice_days: 30,
};

/** The draft as `leases` stores it. */
export const storedLease = (set: Record<string, unknown> = {}) => ({
  id: LEASE,
  property_id: PROPERTY,
  ...demoDraft,
  due_offset_days: 0,
  paid_through_date: null,
  status: 'draft',
  ...set,
});

/** The same lease as a plan reads it, typed. */
export const viewLease = (set: Record<string, unknown> = {}): ViewRows['leases'] =>
  leaseRowSchema.parse({ ...storedLease(set), terminated_on: null, termination_reason: null, renewal_of_lease_id: null });

/** What activating that lease on 2026-10-07 with rent paid through 30/09 writes and previews. */
export const OCTOBER = { id: '0b6c1f9e-7d1a-4c55-9a3e-5b0c2d1e0f10', period_start: '2026-10-01', period_end: '2026-10-31', due_date: '2026-10-01', status: 'issued' };
export const demoBills = [
  { period_start: '2026-10-01', period_end: '2026-10-31', due_date: '2026-10-01', rent_vnd: 9_000_000, issues_now: true },
  { period_start: '2026-11-01', period_end: '2026-11-30', due_date: '2026-11-01', rent_vnd: 9_000_000, issues_now: false },
];
