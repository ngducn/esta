import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSlot, writeSlotWorkdir } from './slot.ts';

const COMMANDS: Record<string, string[]> = {
  start: ['start'],
  stop: ['stop'],
  status: ['status'],
  reset: ['db', 'reset'],
  test: ['test', 'db'],
  types: ['gen', 'types', 'typescript', '--local'],
};

const repoRoot = join(import.meta.dirname, '..');
const [command, ...extra] = process.argv.slice(2);
const args = command === undefined ? undefined : COMMANDS[command];
if (args === undefined) {
  console.error(`Usage: node scripts/db.ts <${Object.keys(COMMANDS).join('|')}> [supabase flags]`);
  process.exit(2);
}

const slot = parseSlot(process.env.ESTA_SLOT);
const workdir = writeSlotWorkdir(repoRoot, slot);
console.error(`ESTA_SLOT=${slot} workdir=${workdir}`);

const capture = command === 'types';
const result = spawnSync('supabase', [...args, '--workdir', workdir, ...extra], {
  stdio: ['inherit', capture ? 'pipe' : 'inherit', 'inherit'],
  encoding: 'utf8',
});
if (result.error) throw result.error;
if (result.status === 0 && capture) {
  writeFileSync(join(repoRoot, 'packages', 'db', 'src', 'database.types.ts'), result.stdout);
}
process.exit(result.status ?? 1);
