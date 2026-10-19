import { expect, type APIResponse, type Page } from '@playwright/test';
import { join } from 'node:path';
import { parseSlot } from '../../scripts/slot.ts';
import { slotEnv } from '../../scripts/slot-env.ts';
import { accessToken } from './session';

const env = slotEnv(join(import.meta.dirname, '..', '..'), parseSlot(process.env.ESTA_SLOT));

export const restUrl = `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1`;

export const authApi = {
  url: `${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`,
  headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '' },
};

/** PostgREST as the signed-in member, so RLS and the grants decide what it reads and writes. */
export async function memberCall(page: Page, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, data?: unknown): Promise<APIResponse> {
  return page.request.fetch(`${restUrl}/${path}`, {
    method,
    headers: { ...authApi.headers, authorization: `Bearer ${await accessToken(page)}`, 'content-type': 'application/json', prefer: 'return=representation' },
    ...(data === undefined ? {} : { data }),
  });
}

/** A `memberCall` that must succeed, and its JSON body (null when it has none). */
export async function memberRest<T>(page: Page, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, data?: unknown): Promise<T> {
  const response = await memberCall(page, method, path, data);
  const text = await response.text();
  expect(response.ok(), text).toBe(true);
  return (text === '' ? null : JSON.parse(text)) as T;
}
