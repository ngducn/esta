import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tableChecksums, type TableChecksum } from './db-checksum.ts';
import { parseSlot, slotWorkdir } from './slot.ts';

// FND-7: two resets with the same arguments must leave identical business data.
const repoRoot = join(import.meta.dirname, '..');
const resetArgs = process.argv.slice(2);
const workdir = slotWorkdir(repoRoot, parseSlot(process.env.ESTA_SLOT));

function resetAndChecksum(): TableChecksum[] {
  const reset = spawnSync(process.execPath, [join(repoRoot, 'scripts', 'db.ts'), 'reset', ...resetArgs], {
    stdio: ['inherit', 'inherit', 'inherit'],
  });
  if (reset.error) throw reset.error;
  if (reset.status !== 0) process.exit(reset.status ?? 1);
  return tableChecksums(workdir);
}

const first = resetAndChecksum();
const second = resetAndChecksum();
const tables = [...new Set([...first, ...second].map(({ table }) => table))].sort();
let identical = true;
for (const table of tables) {
  const a = first.find((row) => row.table === table);
  const b = second.find((row) => row.table === table);
  const same = a !== undefined && b !== undefined && a.md5 === b.md5 && a.rows === b.rows;
  identical &&= same;
  console.log(`${a?.md5 ?? '-'.repeat(32)}  ${b?.md5 ?? '-'.repeat(32)}  ${String(a?.rows ?? 0).padStart(5)}  ${table}  ${same ? 'identical' : 'DIFFERENT'}`);
}
console.log(identical ? 'identical' : 'different');
process.exit(identical ? 0 : 1);
