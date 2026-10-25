import { describe, expect, it } from 'vitest';
import { fakeDb } from '../../src/test/fake-db';
import { runSheet } from '../../src/tools/fact-sheet';
import { ledgerTool } from '../../src/tools/ledger';
import { listPropertiesTool } from '../../src/tools/list-properties';
import { ToolRejection } from '../../src/tools/server';
import { askTables } from '../ask-seed';
import { HOUSEHOLD } from '../full-seed';

const DI_AN = '93cc970b-f9c2-52f5-bc34-1f1edb76742c';
const OTHER = '00000000-0000-4000-8000-00000000b0b0';

async function ledgerFor(householdId: string, tables = askTables('')) {
  const db = fakeDb(tables);
  const { sheet, cite } = runSheet();
  const properties = listPropertiesTool(db, householdId, cite);
  await properties.run();
  return { sheet, ledger: ledgerTool(db, householdId, 'vi', properties.records, cite) };
}

const Q7 = 'f6';

describe('ledger (AGENT.md §4)', () => {
  it('answers one property and month with its Thu chi link, under the same handles when asked again', async () => {
    const { ledger } = await ledgerFor(HOUSEHOLD);
    const first = await ledger({ property: 'f3', year: 2026, month: 10 });
    expect(first.ledger).toMatchObject({ handle: 'f8', property_label: 'Dãy trọ Dĩ An', period_date_display: '10/2026', income_display: '1.000.000 ₫', link: `esta://ledger/${DI_AN}` });
    expect(first).not.toHaveProperty('by_month');
    expect(await ledger({ property: 'f3', year: 2026, month: 10 })).toBe(first);
  });

  it('answers a whole year with its spending by category and one record per month', async () => {
    const { ledger } = await ledgerFor(HOUSEHOLD);
    const year = await ledger({ property: Q7, year: 2026 });
    expect(year.ledger).toMatchObject({ property_label: 'Nhà phố Q7', period_date_display: '2026' });
    expect(year.expenses_by_category).toEqual(
      expect.arrayContaining([expect.objectContaining({ category: 'repair', amount_display: '8.650.000 ₫' }), expect.objectContaining({ category: 'maintenance', amount_display: '1.200.000 ₫' })]),
    );
    expect(year.by_month?.map((month) => month.month_date_display)).toEqual(Array.from({ length: 12 }, (_, i) => `${i + 1}/2026`));
  });

  it('answers the whole household with no property and no link', async () => {
    const { ledger } = await ledgerFor(HOUSEHOLD);
    const household = await ledger({ year: 2026, month: 10 });
    const diAn = await ledger({ property: 'f3', year: 2026, month: 10 });
    expect(household.ledger).toMatchObject({ property_label: null, link: null });
    expect(household.ledger.income_display).not.toBe(diAn.ledger.income_display);
  });

  it('counts no payment another household recorded on the property', async () => {
    const tables = askTables('');
    tables.allocation_facts?.push({ amount_vnd: 9_000_000, household_id: OTHER, invoice_id: OTHER, payment_id: OTHER, property_id: DI_AN, received_on: '2026-10-05' });
    const { ledger } = await ledgerFor(HOUSEHOLD, tables);
    expect((await ledger({ property: 'f3', year: 2026, month: 10 })).ledger).toMatchObject({ income_display: '1.000.000 ₫' });
  });

  it('bound to another household, lists none of these properties and refuses their handles', async () => {
    const { ledger } = await ledgerFor(OTHER);
    await expect(ledger({ property: 'f3', year: 2026, month: 10 })).rejects.toThrow(ToolRejection);
  });

  it('refuses a month out of range and an unknown handle', async () => {
    const { ledger } = await ledgerFor(HOUSEHOLD);
    await expect(ledger({ property: 'f3', year: 2026, month: 13 })).rejects.toThrow('month');
    await expect(ledger({ property: 'f99', year: 2026 })).rejects.toThrow('f99');
  });
});
