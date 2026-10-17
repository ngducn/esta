import { chromium, type FullConfig } from '@playwright/test';
import { primarySections, accountSections } from '../apps/web/src/components/shell/nav.ts';
import { signIn } from './helpers/inbucket';

/**
 * `next dev` compiles a route on its first request, and with six workers compiling at once a first tap can wait
 * longer than an assertion's timeout. Asking for each section once, signed in, compiles them before any test runs.
 */
export default async function warmRoutes(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL;
  if (baseURL === undefined) return;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ baseURL });
    await signIn(page, 'warm.routes@demo.esta.test');
    for (const { href } of [...primarySections, ...accountSections]) await page.request.get(href);
  } finally {
    await browser.close();
  }
}
