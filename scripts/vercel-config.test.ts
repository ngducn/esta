import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

it('vercel.json stops production deploys from git, so a merge cannot run ahead of its migrations (DEPLOY.md section 13)', () => {
  const config = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'vercel.json'), 'utf8')) as { git?: { deploymentEnabled?: Record<string, boolean> } };
  expect(config.git?.deploymentEnabled?.main).toBe(false);
});
