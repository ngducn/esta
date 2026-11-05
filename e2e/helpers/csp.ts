import type { Page } from '@playwright/test';

/**
 * Every Content Security Policy violation the page raises, across navigations, as "directive blocked-url".
 * A worker the policy refuses raises no event on the page, only a console error, so both are read.
 */
export async function watchViolations(page: Page): Promise<string[]> {
  const violations: string[] = [];
  await page.exposeFunction('reportViolation', (what: string) => violations.push(what));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      void (window as unknown as { reportViolation(what: string): void }).reportViolation(`${event.violatedDirective} ${event.blockedURI} ${event.sourceFile}:${event.lineNumber}`);
    });
  });
  page.on('console', (message) => {
    if (message.type() === 'error' && message.text().includes('Content Security Policy')) violations.push(message.text());
  });
  return violations;
}
