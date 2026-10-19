import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAX_AMOUNT_VND } from '../packages/core/src/money/vnd.ts';

const tests = join(import.meta.dirname, '..', 'supabase', 'tests');

describe('invoice_balances_parity.test.sql', () => {
  it('holds exactly the rows of fixtures/payment_status.csv', () => {
    const [, ...csv] = readFileSync(join(tests, 'fixtures', 'payment_status.csv'), 'utf8').trim().split('\n');
    const sql = readFileSync(join(tests, 'invoice_balances_parity.test.sql'), 'utf8');
    const rows = [...sql.matchAll(/\('([^']+)', (\d+)::bigint, (\d+)::bigint, '(\w+)'\)/g)].map((match) => match.slice(1).join(','));
    expect(rows).toEqual(csv);
  });
});

describe('expenses.test.sql', () => {
  it('tries the amount CHECK at the core ceiling and one đồng above it', () => {
    const sql = readFileSync(join(tests, 'expenses.test.sql'), 'utf8');
    expect(sql.match(/^\\set amount_ceiling (\d+)$/m)?.[1]).toBe(String(MAX_AMOUNT_VND));
    expect(sql).toContain(":'a', :amount_ceiling),");
    expect(sql).toContain(":'a', :amount_ceiling + 1),");
  });
});

describe('deposit_ledger_parity.test.sql', () => {
  it('holds exactly the rows of fixtures/deposit_ledgers.csv', () => {
    const [, ...csv] = readFileSync(join(tests, 'fixtures', 'deposit_ledgers.csv'), 'utf8').trim().split('\n');
    const sql = readFileSync(join(tests, 'deposit_ledger_parity.test.sql'), 'utf8');
    const rows = [...sql.matchAll(/\('([^']+)', (\d+), '(\w+)', (\d+)::bigint, '([\d-]+)', '(\w+)'\)/g)].map((match) => match.slice(1).join(','));
    expect(rows).toEqual(csv);
  });
});
