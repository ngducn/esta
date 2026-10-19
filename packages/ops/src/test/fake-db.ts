import { clockAt, parseInstant } from '@esta/core';
import type { Database } from '@esta/db';
import { createClient } from '@supabase/supabase-js';
import type { Db } from '../db';
import type { OpContext } from '../op';
import type { Pending } from '../view';

export type Sent = { readonly method: string; readonly table: string; readonly query: URLSearchParams; readonly body: unknown };

/**
 * A session client whose PostgREST answers come from `rows` (none by default), keeping every request it sent. A
 * `.single()` read gets the first row, as PostgREST's object response does.
 */
export function fakeDb(rows: (sent: Sent) => readonly unknown[] = () => []) {
  const sent: Sent[] = [];
  const db: Db = createClient<Database>('http://fake.test', 'anon', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        const text = typeof init?.body === 'string' ? init.body : '';
        const request: Sent = { method: init?.method ?? 'GET', table: url.pathname.replace('/rest/v1/', ''), query: url.searchParams, body: text === '' ? null : JSON.parse(text) };
        sent.push(request);
        const single = new Headers(init?.headers).get('Accept')?.includes('vnd.pgrst.object') === true;
        const reply = rows(request);
        return new Response(JSON.stringify(single ? reply[0] : reply), { status: 200, headers: { 'content-type': 'application/json' } });
      },
    },
  });
  return { db, sent };
}

export const HOUSEHOLD = '0b6c1f9e-7d1a-4c55-9a3e-5b0c2d1e0001';

/** An op context on `db` in one household at a frozen instant, with the batch's pending rows when given. */
export function opContext(db: Db, pending?: Pending): OpContext {
  const clock = clockAt({ kind: 'env', now: parseInstant('2026-10-07T02:00:00.000Z') }, 'Asia/Ho_Chi_Minh');
  return { db, householdId: HOUSEHOLD, clock, ...(pending === undefined ? {} : { pending }) };
}
