import type { Page } from '@playwright/test';

/** The session's access token, read from the `@supabase/ssr` cookie, which may be split into numbered chunks. */
export async function accessToken(page: Page): Promise<string> {
  const chunks = (await page.context().cookies())
    .filter((cookie) => /^sb-.+-auth-token(\.\d+)?$/.test(cookie.name))
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }))
    .map((cookie) => cookie.value)
    .join('');
  const session = JSON.parse(Buffer.from(chunks.replace(/^base64-/, ''), 'base64url').toString('utf8')) as { access_token: string };
  return session.access_token;
}
