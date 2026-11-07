import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { z } from 'zod';

const repoRoot = join(import.meta.dirname, '..');
const webRoot = join(repoRoot, 'apps', 'web');

const config = z
  .object({
    regions: z.array(z.string()),
    git: z.object({ deploymentEnabled: z.record(z.string(), z.boolean()) }),
    crons: z.array(z.object({ path: z.string(), schedule: z.string() })),
  })
  .parse(JSON.parse(readFileSync(join(webRoot, 'vercel.json'), 'utf8')));

// The Vercel project's Root Directory is apps/web, and Vercel reads vercel.json only from there: a `vercel build`
// with a top-level copy produced no crons and no headers (measured 2026-11-07, DEPLOY.md section 4).
it('keeps vercel.json in apps/web, the only folder Vercel reads it from', () => {
  expect(existsSync(join(repoRoot, 'vercel.json'))).toBe(false);
});

it('runs functions in Singapore, next to the Supabase projects', () => {
  expect(config.regions).toEqual(['sin1']);
});

it('stops production deploys from git, so a merge cannot run ahead of its migrations (DEPLOY.md section 13)', () => {
  expect(config.git.deploymentEnabled.main).toBe(false);
});

it('schedules only cron routes that exist', () => {
  expect(config.crons.length).toBeGreaterThan(0);
  for (const { path } of config.crons) expect(existsSync(join(webRoot, 'src', 'app', ...path.split('/').filter(Boolean), 'route.ts')), path).toBe(true);
});
