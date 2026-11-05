import type { Page } from '@playwright/test';
import { signIn } from './inbucket';
import { uniqueEmail } from './shell';
import { MEMBER, OPERATOR, type OpenRoute, type Viewer } from '../routes.ts';

export const THEMES = ['light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

const ADDRESS: Record<Exclude<Viewer, 'signed-out'>, () => string> = { member: () => MEMBER, operator: () => OPERATOR, newcomer: () => uniqueEmail('routes') };

/** Opens the browser as one kind of viewer in one theme; a signed-out viewer gets no session. */
export async function startAs(page: Page, baseURL: string, viewer: Viewer, theme: Theme): Promise<void> {
  await page.context().clearCookies();
  await page.context().addCookies([{ name: 'esta_theme', value: theme, url: baseURL }]);
  if (viewer !== 'signed-out') await signIn(page, ADDRESS[viewer]());
}

/** Goes to the route and waits until its page has drawn a heading. */
export async function visit(page: Page, route: OpenRoute): Promise<void> {
  await page.goto(route.path);
  await page.locator('main h1, main h2, h1').first().waitFor({ state: 'visible', timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready);
}

export const VIEWERS: readonly Viewer[] = ['member', 'operator', 'signed-out', 'newcomer'];

export const routesOf = (all: readonly OpenRoute[], viewer: Viewer) => all.filter((route) => route.viewer === viewer);
