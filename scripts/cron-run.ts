import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseSlot } from './slot.ts';
import { slotEnv } from './slot-env.ts';

const repoRoot = join(import.meta.dirname, '..');
const env = slotEnv(repoRoot, parseSlot(process.env.ESTA_SLOT), { withKeys: false });
if (!env.CRON_SECRET) {
  console.error('CRON_SECRET is unset: run pnpm dev once to create apps/web/.env.local, or export it');
  process.exit(1);
}

const cronDir = join(repoRoot, 'apps', 'web', 'src', 'app', 'api', 'cron');
const paths = readdirSync(cronDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => `/api/cron/${entry.name}`)
  .sort();

let failed = false;
for (const path of paths) {
  const response = await fetch(`http://localhost:${env.PORT}${path}`, {
    headers: { authorization: `Bearer ${env.CRON_SECRET}` },
  });
  console.log(`${response.status} ${path} ${await response.text()}`);
  failed ||= !response.ok;
}
process.exit(failed ? 1 : 0);
