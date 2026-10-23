import { describe, expect, it } from 'vitest';
import goldenDFile from '../../../../fixtures/statements/golden-d.json';
import goldenFile from '../../../../fixtures/statements/golden.json';
import invoicesFile from '../../../../fixtures/statements/invoices.json';
import layoutA from '../../../../fixtures/statements/layout-a.csv?raw';
import layoutB from '../../../../fixtures/statements/layout-b.xlsx.json';
import layoutC from '../../../../fixtures/statements/layout-c.csv?raw';
import layoutD from '../../../../fixtures/statements/layout-d.csv?raw';
import { decodeStatement, decodeStatementCsv } from './decode';
import { identifyRows } from './fingerprint';
import { STATEMENT_LAYOUTS, type StatementLayoutId } from './layouts';
import { matchRows, type StatementMatch } from './match';
import { renderCsv } from './render';
import { SCENARIO_INVOICES, SCENARIO_REJECTED, SCENARIO_ROWS, scenarioGrid, UNRECOGNIZED_COLUMNS, unrecognizedGrid } from './statement-scenario';

const DIR = '../../../../fixtures/statements/';
const FILES: Readonly<Record<StatementLayoutId, string>> = { a: 'layout-a.csv', b: 'layout-b.xlsx.json', c: 'layout-c.csv' };
/** Layout D is the bank Esta does not recognize, read under the columns a person picks for it. */
const DECODED = { a: decodeStatementCsv(layoutA), b: decodeStatement(layoutB), c: decodeStatementCsv(layoutC), d: decodeStatementCsv(layoutD, UNRECOGNIZED_COLUMNS) } as const;
type FileId = keyof typeof DECODED;
const ALL = Object.keys(DECODED) as FileId[];

function rendered(id: StatementLayoutId): string {
  const grid = scenarioGrid(STATEMENT_LAYOUTS[id]);
  return id === 'b' ? `${JSON.stringify(grid, null, 2)}\n` : renderCsv(grid);
}

const fingerprints = identifyRows(SCENARIO_ROWS).map((identity) => identity.fingerprint);
const golden = {
  rows: SCENARIO_ROWS.map(({ expect: match, ...row }, i) => ({ index: i + 1, ...row, fingerprint: fingerprints[i] as string, match })),
  rejected: SCENARIO_REJECTED,
};

/** Layout D's lines sit under its account lines, so each line index, and the line a repeat points at, moves down by its header row. */
const below = (index: number) => index + UNRECOGNIZED_COLUMNS.headerRow;
const goldenD = {
  rows: golden.rows.map((row) => ({ ...row, index: below(row.index), match: 'repeatOf' in row.match ? { ...row.match, repeatOf: below(row.match.repeatOf) } : row.match })),
  rejected: golden.rejected.map((row) => ({ ...row, index: below(row.index) })),
};

function matched(id: FileId, knownFingerprints?: ReadonlySet<string>): typeof golden {
  const decoded = DECODED[id];
  if (!decoded.ok) throw new Error(decoded.reason);
  const rows = matchRows(decoded.value.rows, SCENARIO_INVOICES, knownFingerprints === undefined ? {} : { knownFingerprints });
  return { rows: rows.map(({ row, fingerprint, match }) => ({ ...row, fingerprint, match })), rejected: decoded.value.rejected };
}

describe('fixtures/statements (LSE-8)', () => {
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

  it('holds layout D as the unrecognized bank renders it, with no header Esta recognizes', async () => {
    await expect(renderCsv(unrecognizedGrid())).toMatchFileSnapshot(`${DIR}layout-d.csv`);
    expect(decodeStatementCsv(layoutD)).toEqual({ ok: false, reason: 'no_header' });
  });

  it('layout D decodes under the columns a person picks exactly as golden-d.json says, with the fingerprints of golden.json', async () => {
    await expect(`${JSON.stringify(goldenD, null, 2)}\n`).toMatchFileSnapshot(`${DIR}golden-d.json`);
    expect(matched('d')).toEqual(goldenD);
    expect(matched('d')).toEqual(goldenDFile);
    expect(matched('d').rows.map((row) => row.fingerprint)).toEqual(goldenFile.rows.map((row) => row.fingerprint));
  });

  it.each(ALL)('layout %s imported again after any layout, by its labels or by a mapping, matches nothing', (id) => {
    for (const earlier of ALL) {
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
