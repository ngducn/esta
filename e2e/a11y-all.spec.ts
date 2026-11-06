import { expect, test } from '@playwright/test';
import { OPEN_ROUTES } from './routes.ts';
import { routesOf, startAs, THEMES, VIEWERS, visit } from './helpers/app-routes';
import { noSidewaysScroll, seriousAxeViolations } from './helpers/wizard';

for (const theme of THEMES) {
  for (const viewer of VIEWERS) {
    const routes = routesOf(OPEN_ROUTES, viewer);
    test(`every ${viewer} route is free of serious axe issues and sideways scroll in the ${theme} theme`, async ({ page, baseURL }) => {
      test.setTimeout(600_000);
      await startAs(page, baseURL ?? '', viewer, theme);
      const problems: string[] = [];
      for (const route of routes) {
        await visit(page, route);
        for (const violation of await seriousAxeViolations(page)) problems.push(`${route.id}: ${violation}`);
        if (!(await noSidewaysScroll(page))) problems.push(`${route.id}: the page scrolls sideways`);
      }
      expect(problems).toEqual([]);
    });
  }
}
