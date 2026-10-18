import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const tests = join(import.meta.dirname, '..', 'supabase', 'tests');

describe('invoice_balances_parity.test.sql', () => {
  it('holds exactly the rows of fixtures/payment_status.csv', () => {
    const [, ...csv] = readFileSync(join(tests, 'fixtures', 'payment_status.csv'), 'utf8').trim().split('\n');
    const sql = readFileSync(join(tests, 'invoice_balances_parity.test.sql'), 'utf8');
    const rows = [...sql.matchAll(/\('([^']+)', (\d+)::bigint, (\d+)::bigint, '(\w+)'\)/g)].map((match) => match.slice(1).join(','));
    expect(rows).toEqual(csv);
  });
});
