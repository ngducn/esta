import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { parseSlot } from './slot.ts';
import { slotEnv } from './slot-env.ts';

const repoRoot = join(import.meta.dirname, '..');
const env = slotEnv(repoRoot, parseSlot(process.env.ESTA_SLOT), { withKeys: false });
if (!env.CRON_SECRET) {
  console.error('CRON_SECRET is unset: run pnpm dev once to create apps/web/.env.local, or export it');
  process.exit(1);
}

// vercel.json lists the jobs in the order they run each night, so a local run follows production.
const { crons } = z
  .object({ crons: z.array(z.object({ path: z.string().startsWith('/api/cron/') })) })
  .parse(JSON.parse(readFileSync(join(repoRoot, 'vercel.json'), 'utf8')));

/** `{"ok":true,"drafted":0}` prints as `drafted=0`; any other body prints as it came. */
function summary(body: string): string {
  try {
    const fields = Object.entries(z.record(z.string(), z.unknown()).parse(JSON.parse(body)));
    return fields.flatMap(([key, value]) => (key === 'ok' ? [] : [`${key}=${String(value)}`])).join(' ');
  } catch {
    return body;
  }
}

let failed = false;
for (const { path } of crons) {
  const response = await fetch(`http://localhost:${env.PORT}${path}`, {
    headers: { authorization: `Bearer ${env.CRON_SECRET}` },
  });
  console.log(`${response.status} ${path.slice('/api/cron/'.length)} ${summary(await response.text())}`);
  failed ||= !response.ok;
}
process.exit(failed ? 1 : 0);
