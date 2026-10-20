import type { APIRequestContext } from '@playwright/test';
import { gzipSync } from 'node:zlib';

/** SPEC §7.2's initial JS budget for a route, gzipped. */
export const INITIAL_JS_BUDGET_BYTES = 200_000;

export type InitialJs = { readonly sources: readonly string[]; readonly gzippedBytes: number; readonly withIntlRuntime: readonly string[] };

/**
 * Every script the route's HTML names, gzipped at level 9 and summed, and those that carry the next-intl client
 * runtime. A production chunk can rename `IntlMessageFormat`, so use-intl's error code `INSUFFICIENT_PATH` marks the
 * runtime too. `request` carries the caller's cookies, so a signed-in page measures the page the member gets.
 */
export async function initialJs(request: APIRequestContext, path: string): Promise<InitialJs> {
  const html = await (await request.get(path)).text();
  const sources = [...new Set(html.match(/(?<=<script src=")[^"]+/g))];
  const withIntlRuntime: string[] = [];
  let gzippedBytes = 0;
  for (const source of sources) {
    const body = await (await request.get(source)).body();
    if (body.includes('IntlMessageFormat') || body.includes('INSUFFICIENT_PATH')) withIntlRuntime.push(source);
    gzippedBytes += gzipSync(body, { level: 9 }).length;
  }
  return { sources, gzippedBytes, withIntlRuntime };
}
