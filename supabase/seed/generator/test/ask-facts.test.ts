// Reads the seeded database of the ESTA_SLOT stack after `pnpm db:reset`: `pnpm seed:facts`. The Ask golden test
// compares each answer with ask-ground-truth.json, and this test holds that file to the SQL ground truth on the seed.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { query } from '../../../../scripts/db-checksum.ts';
import { parseSlot, slotWorkdir } from '../../../../scripts/slot.ts';

const root = join(import.meta.dirname, '../../../..');
const golden = join(root, 'apps/agent/test/golden');

it('the Ask golden figures equal ask-ground-truth.sql on the full seed (AGENT.md §7.4)', () => {
  // The CLI reads an argument that starts with `--` as a flag, so the file's comment lines stay behind.
  const sql = readFileSync(join(golden, 'ask-ground-truth.sql'), 'utf8').replace(/^--.*\n/gm, '');
  const rows = query<{ question: string; figure: string; value: number }>(slotWorkdir(root, parseSlot(process.env.ESTA_SLOT)), sql);
  expect(rows).toEqual(JSON.parse(readFileSync(join(golden, 'ask-ground-truth.json'), 'utf8')));
});
