import { describe, expect, it } from 'vitest';
import goldenFile from '../../../../fixtures/statements/golden.json';
import invoicesFile from '../../../../fixtures/statements/invoices.json';
import layoutA from '../../../../fixtures/statements/layout-a.csv?raw';
import layoutB from '../../../../fixtures/statements/layout-b.xlsx.json';
import layoutC from '../../../../fixtures/statements/layout-c.csv?raw';
import { decodeCsv, decodeStatement } from './decode';
import { identifyRows } from './fingerprint';
import { STATEMENT_LAYOUTS, type StatementGrid, type StatementLayoutId } from './layouts';
import { matchRows, type StatementMatch } from './match';
import { renderCsv } from './render';
import { SCENARIO_INVOICES, SCENARIO_REJECTED, SCENARIO_ROWS, scenarioGrid } from './statement-scenario';

const DIR = '../../../../fixtures/statements/';
const FILES: Readonly<Record<StatementLayoutId, string>> = { a: 'layout-a.csv', b: 'layout-b.xlsx.json', c: 'layout-c.csv' };
const COMMITTED: Readonly<Record<StatementLayoutId, StatementGrid>> = { a: decodeCsv(layoutA), b: layoutB, c: decodeCsv(layoutC) };

function rendered(id: StatementLayoutId): string {
  const grid = scenarioGrid(STATEMENT_LAYOUTS[id]);
  return id === 'b' ? `${JSON.stringify(grid, null, 2)}\n` : renderCsv(grid);
}

const fingerprints = identifyRows(SCENARIO_ROWS).map((identity) => identity.fingerprint);
const golden = {
  rows: SCENARIO_ROWS.map(({ expect: match, ...row }, i) => ({ index: i + 1, ...row, fingerprint: fingerprints[i] as string, match })),
  rejected: SCENARIO_REJECTED,
};

function matched(id: StatementLayoutId, knownFingerprints?: ReadonlySet<string>): typeof golden {
  const decoded = decodeStatement(COMMITTED[id]);
  if (!decoded.ok) throw new Error(decoded.reason);
  const rows = matchRows(decoded.value.rows, SCENARIO_INVOICES, knownFingerprints === undefined ? {} : { knownFingerprints });
  return { rows: rows.map(({ row, fingerprint, match }) => ({ ...row, fingerprint, match })), rejected: decoded.value.rejected };
}

describe('fixtures/statements', () => {
  it('holds the invoices and the golden result the scenario states', async () => {
    await expect(`${JSON.stringify(SCENARIO_INVOICES, null, 2)}\n`).toMatchFileSnapshot(`${DIR}invoices.json`);
    await expect(`${JSON.stringify(golden, null, 2)}\n`).toMatchFileSnapshot(`${DIR}golden.json`);
    expect(invoicesFile).toEqual(SCENARIO_INVOICES);
  });

  it.each(Object.keys(FILES) as StatementLayoutId[])('holds layout %s as the scenario renders it', async (id) => {
    await expect(rendered(id)).toMatchFileSnapshot(`${DIR}${FILES[id]}`);
  });

  it.each(Object.keys(FILES) as StatementLayoutId[])('layout %s decodes and matches exactly as golden.json says', (id) => {
    expect(matched(id)).toEqual(golden);
    expect(matched(id)).toEqual(goldenFile);
  });

  it.each(Object.keys(FILES) as StatementLayoutId[])('layout %s imported again after any layout matches nothing', (id) => {
    for (const earlier of Object.keys(FILES) as StatementLayoutId[]) {
      const again = matched(id, new Set(matched(earlier).rows.map((row) => row.fingerprint)));
      expect(again.rows.map((row) => row.match)).toEqual(golden.rows.map(() => ({ status: 'ignored', reason: 'duplicate' })));
    }
  });

  it('covers every match status the matcher can produce, plus a refusal', () => {
    const label = (match: StatementMatch): string =>
      'reason' in match ? `${match.status}:${match.reason}` : 'repeatOf' in match ? `${match.status}:repeat` : match.status;
    expect([...new Set(SCENARIO_ROWS.map((row) => label(row.expect)))].sort()).toEqual([
      'ignored:debit',
      'ignored:duplicate',
      'memo_match',
      'suggested',
      'unmatched',
      'unmatched:repeat',
    ]);
    expect(SCENARIO_ROWS.filter((row) => row.expect.status === 'unmatched' && row.expect.candidateIds.length === 2)).toHaveLength(1);
    expect(SCENARIO_REJECTED).toHaveLength(1);
  });
});
