import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { readClock } from '../packages/ops/src/clock.ts';
import { writeExport, zipPartsSink } from '../packages/db/src/export/index.ts';
import { DEMO_PASSWORD } from '../supabase/seed/generator/households.ts';
import { localTarget } from './export-source.ts';
import { slotEnv } from './slot-env.ts';

const [email, dir, partMb = '45'] = process.argv.slice(2);
if (email === undefined || dir === undefined) {
  console.error('Usage: node scripts/export-household.ts <seeded member email> <folder> [part size in MB]');
  process.exit(2);
}
const target = localTarget();
const env = slotEnv(join(import.meta.dirname, '..'), target.slot);
const client = createClient(target.apiUrl, env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '', { auth: { persistSession: false } });
const { error } = await client.auth.signInWithPassword({ email, password: DEMO_PASSWORD });
if (error) throw error;
const { data: member, error: memberError } = await client.from('household_members').select('household_id').limit(1).single();
if (memberError) throw memberError;
const clock = await readClock(client, { ESTA_ENV: env.ESTA_ENV, ESTA_FROZEN_NOW: env.ESTA_FROZEN_NOW, ESTA_TIMEZONE: env.ESTA_TIMEZONE ?? 'Asia/Ho_Chi_Minh' });
mkdirSync(dir, { recursive: true });
const sink = zipPartsSink({
  partBytes: Number(partMb) * 1024 * 1024,
  partName: (index) => (index === 1 ? 'export.zip' : `export-part-${index}.zip`),
  upload: async (name, bytes) => void writeFileSync(join(dir, name), bytes),
  mtime: Date.parse(clock.now()),
});
const { manifest } = await writeExport(client, member.household_id, sink, { clock });
console.log(`exported household ${manifest.householdId}: ${Object.values(manifest.tables).reduce((sum, rows) => sum + rows, 0)} rows, ${manifest.files} files, ${manifest.parts.length} part(s) in ${dir}`);
