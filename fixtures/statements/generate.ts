import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { isoDate } from '../../packages/core/src/date/iso-date.ts';
import { vnd } from '../../packages/core/src/money/vnd.ts';
import { e2eServiceHeaders } from '../../scripts/e2e-service.ts';
import { parseSlot } from '../../scripts/slot.ts';
import { slotEnv } from '../../scripts/slot-env.ts';
import { seedId } from '../../supabase/seed/generator/ids.ts';
import { UNRECOGNIZED_COLUMNS } from '../../packages/core/src/matching/statement-scenario.ts';
import { golden, householdStatement, statementCsv, statementXlsx, unrecognizedCsv, type OpenBill } from './household.ts';

/**
 * `pnpm tsx fixtures/statements/generate.ts --household <n>` writes lane household n's statement in the three layouts
 * (`layout-a.csv`, `layout-b.xlsx`, `layout-c.csv`) and `golden.json`, and as a bank Esta does not recognize
 * (`layout-d.csv`, mapped by hand, and `golden-d.json`), from the bills it owes on the slot's local stack as of the test
 * clock (`--as-of` overrides it). Household 0 is `Gia đình Demo`.
 */
const { values } = parseArgs({ options: { household: { type: 'string' }, 'as-of': { type: 'string' }, out: { type: 'string' } } });
const lane = Number(values.household);
if (!Number.isInteger(lane) || lane < 0) throw new Error('Pass --household <n>, 0 for Gia đình Demo');
const household = seedId(`seed:household:${lane === 0 ? 'demo' : `lane-${lane}`}`);
const rest = `${slotEnv(join(import.meta.dirname, '..', '..'), parseSlot(process.env.ESTA_SLOT), { withKeys: false }).SUPABASE_URL}/rest/v1`;
const headers = e2eServiceHeaders();

async function get(path: string): Promise<unknown> {
  const response = await fetch(`${rest}/${path}`, { headers });
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
  return response.json();
}

const balances = z
  .array(z.object({ id: z.string(), number: z.string(), due_date: z.string(), outstanding_vnd: z.number() }))
  .parse(await get(`invoice_balances?household_id=eq.${household}&status=eq.issued&outstanding_vnd=gt.0&select=id,number,due_date,outstanding_vnd`));
const bills = z
  .array(z.object({ id: z.string(), memo_code: z.string(), lease: z.object({ tenant: z.object({ full_name: z.string() }) }) }))
  .parse(
    await get(
      `invoices?id=in.(${balances.map((row) => row.id).join(',')})&select=id,memo_code,lease:leases!invoices_household_id_lease_id_fkey(tenant:parties!leases_household_id_tenant_party_id_fkey(full_name))`,
    ),
  );
const open: OpenBill[] = balances.map((row) => {
  const bill = bills.find((candidate) => candidate.id === row.id);
  if (bill === undefined) throw new Error(`No memo code for ${row.number}`);
  return { id: row.id, number: row.number, memoCode: bill.memo_code, tenantName: bill.lease.tenant.full_name, dueDate: isoDate(row.due_date), outstanding: vnd(row.outstanding_vnd) };
});

const [clock] = z.array(z.object({ frozen_now: z.string().nullable() })).parse(await get('test_clock?select=frozen_now'));
const asOf = values['as-of'] ?? (clock?.frozen_now ? new Date(clock.frozen_now).toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }) : undefined);
if (asOf === undefined) throw new Error('The test clock is off: pass --as-of YYYY-MM-DD');

const statement = householdStatement(open, isoDate(asOf), `FT${String(lane).padStart(2, '0')}`);
const out = values.out ?? join(tmpdir(), 'esta-statements', `household-${lane}`);
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'layout-a.csv'), statementCsv(statement, 'a'));
writeFileSync(join(out, 'layout-b.xlsx'), await statementXlsx(statement));
writeFileSync(join(out, 'layout-c.csv'), statementCsv(statement, 'c'));
writeFileSync(join(out, 'golden.json'), `${JSON.stringify(golden(statement), null, 2)}\n`);
writeFileSync(join(out, 'layout-d.csv'), unrecognizedCsv(statement));
writeFileSync(join(out, 'golden-d.json'), `${JSON.stringify(golden(statement, UNRECOGNIZED_COLUMNS.headerRow), null, 2)}\n`);
console.log(`Wrote household ${lane}'s statement as of ${asOf} to ${out}`);
