import { expect, type Page } from '@playwright/test';
import { authApi, restUrl } from './auth-api';
import { accessToken } from './session';

/** A PostgREST request as the user signed in on `page`, so RLS keeps it to that user's household. */
export async function userRest<T>(page: Page, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, data?: unknown): Promise<T> {
  const response = await page.request.fetch(`${restUrl}/${path}`, {
    method,
    headers: { ...authApi.headers, authorization: `Bearer ${await accessToken(page)}`, 'content-type': 'application/json', prefer: 'return=representation' },
    ...(data === undefined ? {} : { data }),
  });
  expect(response.ok(), await response.text()).toBe(true);
  const text = await response.text();
  return (text === '' ? null : JSON.parse(text)) as T;
}
