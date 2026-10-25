import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { query } from '../../../../scripts/db-checksum.ts';
import { parseSlot, slotWorkdir } from '../../../../scripts/slot.ts';

const root = join(import.meta.dirname, '../../../..');
const golden = join(root, 'apps/agent/test/golden');

it('the Ask golden figures equal ask-ground-truth.sql on the full seed (AGENT.md §7.4)', () => {
  const sql = readFileSync(join(golden, 'ask-ground-truth.sql'), 'utf8');
  const rows = query<{ question: string; figure: string; value: string }>(slotWorkdir(root, parseSlot(process.env.ESTA_SLOT)), sql);
  expect(rows).toEqual(JSON.parse(readFileSync(join(golden, 'ask-ground-truth.json'), 'utf8')));
});
