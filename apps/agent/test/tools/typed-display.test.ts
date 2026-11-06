import { displayTyped, typedValueSchema } from '@esta/core/calc';
import { isoDate } from '@esta/core/date';
import type { Locale } from '@esta/core/format';
import { describe, expect, it } from 'vitest';
import { fakeDb } from '../../src/test/fake-db';
import { runSheet } from '../../src/tools/fact-sheet';
import { readTools } from '../../src/tools/read-tools';
import { askTables } from '../ask-seed';
import { HOUSEHOLD } from '../full-seed';
import { replayedReads } from '../golden/ask-reads';

type Pair = { path: string; display: string; typed: unknown };

/** Every `<stem>_display` that has a `<stem>_typed` beside it, anywhere in a record the tools returned. */
function pairs(value: unknown, path = ''): Pair[] {
  if (Array.isArray(value)) return value.flatMap((item, i) => pairs(item, `${path}[${i}]`));
  if (typeof value !== 'object' || value === null) return [];
  const record = value as Record<string, unknown>;
  return Object.entries(record).flatMap(([key, child]) => {
    const stem = key.endsWith('_display') ? key.slice(0, -'_display'.length) : null;
    const own = stem !== null && typeof child === 'string' && `${stem}_typed` in record && record[`${stem}_typed`] !== null ? [{ path: `${path}.${key}`, display: child, typed: record[`${stem}_typed`] }] : [];
    return [...own, ...pairs(child, `${path}.${key}`)];
  });
}

async function everyRecord(locale: Locale): Promise<unknown[]> {
  const { cite } = runSheet();
  const tools = new Map(readTools(fakeDb(askTables('')), HOUSEHOLD, { reads: replayedReads(), locale, asOf: isoDate('2026-10-07'), cite }));
  /** A read the fixture never recorded is skipped; every other failure is the test's own. */
  const call = async (name: string, input: Record<string, unknown> = {}) => {
    try {
      return await tools.get(`mcp__esta__${name}`)?.run(input);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('The ask reads fixture holds no')) return null;
      throw error;
    }
  };
  const listed = (await call('list_properties')) as { properties: Array<{ handle: string }> };
  const answers: unknown[] = [listed, await call('portfolio_overview'), await call('list_leases'), await call('collections', { year: 2026, month: 10 }), await call('ledger', { year: 2026 }), await call('tax_position', { year: 2026 }), await call('payment_behavior', { year: 2026 })];
  for (const { handle } of listed.properties) {
    answers.push(await call('get_property', { property: handle }), await call('property_metrics', { property: handle, year: 2026 }), await call('ledger', { property: handle, year: 2026, month: 10 }));
  }
  return answers;
}

describe('L5: every typed value a read tool returns is the figure its display shows', () => {
  it.each(['vi', 'en'] as const)('holds on every record of every read tool in %s', async (locale) => {
    const found = pairs(await everyRecord(locale));
    expect(found.length).toBeGreaterThan(50);
    for (const { path, display, typed } of found) {
      const parsed = typedValueSchema.parse(typed);
      expect(displayTyped(parsed, locale), path).toBe(display);
    }
  });
});
