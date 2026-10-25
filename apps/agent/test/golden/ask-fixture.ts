import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { query } from '../../../../scripts/db-checksum.ts';
import { parseSlot, slotWorkdir } from '../../../../scripts/slot.ts';

export const ASK_FIXTURE = join(import.meta.dirname, 'ask-full-2026-10-07.json');

const DEMO = `(select id from public.households where name = 'Gia đình Demo')`;
const TABLES: Record<string, string> = {
  properties: `select id::text, household_id::text, code, nickname, kind, use_mode, legal_status, current_address, deleted_at from public.properties where household_id = ${DEMO} order by code`,
  admin_units: `select code, name from public.admin_units where code in (select current_address ->> k from public.properties, unnest(array['commune_code', 'province_code']) k where household_id = ${DEMO}) order by code`,
  allocation_facts: `select property_id::text, household_id::text, received_on::text, amount_vnd, payment_id::text, invoice_id::text from public.allocation_facts where household_id = ${DEMO} and received_on >= '2026-01-01' order by payment_id, invoice_id`,
  expenses: `select id::text, property_id::text, household_id::text, paid_on::text, category, amount_vnd, deleted_at from public.expenses where household_id = ${DEMO} and paid_on >= '2026-01-01' order by id`,
};

if (import.meta.main) {
  const workdir = slotWorkdir(join(import.meta.dirname, '../../../..'), parseSlot(process.env.ESTA_SLOT));
  const tables = Object.fromEntries(Object.entries(TABLES).map(([table, sql]) => [table, query(workdir, sql)]));
  writeFileSync(ASK_FIXTURE, `${JSON.stringify(tables, null, 2)}\n`);
  console.log(`Wrote ${ASK_FIXTURE}`);
}
