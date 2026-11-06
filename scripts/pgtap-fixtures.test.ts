import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAX_AMOUNT_VND } from '../packages/core/src/money/vnd.ts';
import { RENT_CHANGE_RANGE } from '../packages/core/src/proposals/registry.ts';

const tests = join(import.meta.dirname, '..', 'supabase', 'tests');

describe('invoice_balances_parity.test.sql', () => {
  it('holds exactly the rows of fixtures/payment_status.csv', () => {
    const [, ...csv] = readFileSync(join(tests, 'fixtures', 'payment_status.csv'), 'utf8').trim().split('\n');
    const sql = readFileSync(join(tests, 'invoice_balances_parity.test.sql'), 'utf8');
    const rows = [...sql.matchAll(/\('([^']+)', (\d+)::bigint, (\d+)::bigint, '(\w+)'\)/g)].map((match) => match.slice(1).join(','));
    expect(rows).toEqual(csv);
  });
});

describe.each(['expenses.test.sql', 'valuations.test.sql'])('%s', (file) => {
  it('tries the amount CHECK at the core ceiling and one đồng above it', () => {
    const sql = readFileSync(join(tests, file), 'utf8');
    expect(sql.match(/^\\set amount_ceiling (\d+)$/m)?.[1]).toBe(String(MAX_AMOUNT_VND));
    expect(sql).toContain(":'a', :amount_ceiling),");
    expect(sql).toContain(":'a', :amount_ceiling + 1),");
  });
});

describe('statement_import_invariants.test.sql', () => {
  it('holds exactly the rows of fixtures/statement_text.csv', () => {
    const [, ...csv] = readFileSync(join(tests, 'fixtures', 'statement_text.csv'), 'utf8').trimEnd().split('\n');
    const sql = readFileSync(join(tests, 'statement_import_invariants.test.sql'), 'utf8');
    const rows = [...sql.matchAll(/^ {4}\('([^']*)', '([^']*)', '([^']*)'\)[,;]$/gm)].map((match) => match.slice(1).join(','));
    expect(rows).toEqual(csv);
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

describe('allocation_vectors_parity.test.sql', () => {
  it('holds exactly the rows of fixtures/allocation_vectors.csv', () => {
    const [, ...csv] = readFileSync(join(tests, 'fixtures', 'allocation_vectors.csv'), 'utf8').trim().split('\n');
    const sql = readFileSync(join(tests, 'allocation_vectors_parity.test.sql'), 'utf8');
    const rows = [...sql.matchAll(/^ {4}\('([^']+)', (\d+)::bigint, '(\w+)', '(\w+)', '(\w+)', '([\d-]+)', '([\d-]+)', (\d+)::bigint, (\d+)::bigint, '(\w+)', (\d+)::bigint, '(\w+)'\)[,;]$/gm)].map((match) => match.slice(1).join(','));
    expect(rows).toEqual(csv);
  });
});

describe('extraction_schema_parity.test.sql', () => {
  it('holds exactly the rows of fixtures/extraction_schemas.csv', () => {
    const [, ...csv] = readFileSync(join(tests, 'fixtures', 'extraction_schemas.csv'), 'utf8').trim().split('\n');
    const sql = readFileSync(join(tests, 'extraction_schema_parity.test.sql'), 'utf8');
    const rows = [...sql.matchAll(/\('(\w+)', (?:'(\w+)'|null)\)/g)].map(([, category, schema]) => `${category},${schema ?? ''}`);
    expect(rows).toEqual(csv);
  });
});

describe('proposal_effects.test.sql', () => {
  it('tries the rent change range at each edge of RENT_CHANGE_RANGE for the 2.500.000 ₫ rent it replaces', () => {
    const rent = 2_500_000;
    const low = (rent * RENT_CHANGE_RANGE.minPercent) / 100;
    const high = (rent * RENT_CHANGE_RANGE.maxPercent) / 100;
    const sql = readFileSync(join(tests, 'proposal_effects.test.sql'), 'utf8');
    const outcome = (amount: number) => sql.match(new RegExp(`'rent_vnd', ${amount}\\)\\), (null|'ESTA_RENT_CHANGE_RANGE')`))?.[1];
    expect([low - 1, low, high, high + 1].map(outcome)).toEqual(["'ESTA_RENT_CHANGE_RANGE'", 'null', 'null', "'ESTA_RENT_CHANGE_RANGE'"]);
  });
});
