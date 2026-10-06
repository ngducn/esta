import { describe, expect, it } from 'vitest';
import { parseInstant } from '../../../packages/core/src/index.ts';
import { seedId } from './ids.ts';
import { DEFAULT_OPTIONS, generate, parseOptions } from './index.ts';
import { PROPERTY_SEEDS } from './properties.ts';
import { createRng, rngFor } from './rng.ts';
import { renderSeed } from './sql.ts';

function insertedRows(sql: string, table: string): string[] {
  const statement = sql.split(';\n').find((part) => part.includes(`insert into ${table} (`));
  return statement === undefined ? [] : statement.split('\n').filter((line) => line.startsWith('  ('));
}

describe('seedId', () => {
  it('matches extensions.uuid_generate_v5(extensions.uuid_ns_url(), key)', () => {
    expect(seedId('seed:household:lane-3')).toBe('77551982-f791-5e3b-8cc6-0622735344d4');
    expect(seedId('seed:property:lane-5:di-an')).toBe('553d22a8-f991-556d-bbce-347d49dafd0f');
  });
});

describe('generate', () => {
  it('emits byte-identical SQL for the same arguments', () => {
    expect(generate(DEFAULT_OPTIONS)).toBe(generate({ ...DEFAULT_OPTIONS }));
  });

  it('changes only timestamps when --as-of changes', () => {
    const later = parseInstant('2027-01-15T08:30:00+07:00');
    const before = generate(DEFAULT_OPTIONS);
    const after = generate({ ...DEFAULT_OPTIONS, asOf: later });
    expect(after).not.toBe(before);
    expect(before.replaceAll(DEFAULT_OPTIONS.asOf, later)).toBe(after);
  });

  it('writes the demo household and N lane households with seven properties each', () => {
    const sql = generate({ ...DEFAULT_OPTIONS, lanes: 3 });
    const households = insertedRows(sql, 'public.households');
    expect(households.map((row) => row.split("'")[3])).toEqual([
      'Gia đình Demo',
      'Gia đình Demo 1',
      'Gia đình Demo 2',
      'Gia đình Demo 3',
    ]);
    expect(insertedRows(sql, 'public.properties')).toHaveLength(28);
    expect(insertedRows(sql, 'public.parties')).toHaveLength(8);
    expect(insertedRows(sql, 'public.notification_preferences')).toHaveLength(8);
    expect(sql).toContain("'ryan.lane3@demo.esta.test'");
  });

  it('leaves Dãy trọ Dĩ An out of every household in northstar', () => {
    const full = insertedRows(generate(DEFAULT_OPTIONS), 'public.properties');
    const northstar = insertedRows(generate({ ...DEFAULT_OPTIONS, variant: 'northstar' }), 'public.properties');
    expect(full).toHaveLength(77);
    expect(northstar).toHaveLength(66);
    expect(full.filter((row) => row.includes('Dãy trọ Dĩ An'))).toHaveLength(11);
    expect(northstar.filter((row) => row.includes('Dãy trọ Dĩ An') || row.includes("'DIAN'"))).toEqual([]);
  });

  it('stamps every row with --as-of and names the seed as the audit actor', () => {
    const sql = generate(DEFAULT_OPTIONS);
    expect(sql).toContain("select set_config('esta.actor', 'system:seed', true);");
    const statements = sql.split(';\n').filter((part) => part.includes('insert into'));
    expect(statements.length).toBeGreaterThan(0);
    for (const statement of statements) {
      expect(statement).toMatch(/\(.*created_at, updated_at\) values/);
      for (const row of statement.split('\n').filter((line) => line.startsWith('  ('))) {
        expect(row).toMatch(/'2026-10-07T02:00:00\.000Z', '2026-10-07T02:00:00\.000Z'\),?$/);
      }
    }
  });
});

describe('PROPERTY_SEEDS', () => {
  it('keeps every location inside Vietnam and every code unique', () => {
    for (const seed of PROPERTY_SEEDS) {
      expect(seed.lat).toBeGreaterThan(8.18);
      expect(seed.lat).toBeLessThan(23.39);
      expect(seed.lng).toBeGreaterThan(102.14);
      expect(seed.lng).toBeLessThan(109.47);
    }
    const codes = PROPERTY_SEEDS.map((seed) => seed.key.replaceAll('-', '').toUpperCase());
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('marks every house number and certificate address as Demo, so no seeded address is a real home', () => {
    for (const seed of PROPERTY_SEEDS) {
      if ('house_no' in seed.address) expect(seed.address.house_no).toMatch(/^\S+ Demo$/);
      expect(seed.certificate_address_text).toMatch(/(Số|số|Lô|Thửa đất số) \S+ Demo, /);
    }
  });
});

describe('renderSeed', () => {
  it('escapes quotes and renders arrays, jsonb, nulls and defaults', () => {
    const sql = renderSeed(
      [{ table: 'public.t', rows: [{ id: 'a', name: "Nhà bà O'Neil", tags: ['owner', 'a"b'], data: { x: 1 } }, { id: 'b', name: null }] }],
      DEFAULT_OPTIONS.asOf,
    );
    expect(sql).toContain(`insert into public.t (id, name, tags, data, created_at, updated_at) values`);
    expect(sql).toContain(`('a', 'Nhà bà O''Neil', '{"owner","a\\"b"}', '{"x":1}', `);
    expect(sql).toContain(`('b', null, default, default, `);
  });
});

describe('parseOptions', () => {
  it('reads the flags and refuses bad values', () => {
    expect(parseOptions(['--households', '3', '--variant', 'northstar', '--as-of', '2026-10-08T00:00:00+07:00'])).toEqual({
      lanes: 3,
      variant: 'northstar',
      asOf: '2026-10-07T17:00:00.000Z',
      out: undefined,
    });
    expect(() => parseOptions(['--households', '-1'])).toThrow(/--households/);
    expect(() => parseOptions(['--households', '100'])).toThrow(/--households/);
    expect(() => parseOptions(['--households'])).toThrow(/--households/);
    for (const value of ['', ' ', 'three', '1e1', '0x3', '3.0']) {
      expect(() => parseOptions(['--households', value]), `--households "${value}"`).toThrow(/--households/);
    }
    expect(() => parseOptions(['--variant', 'tiny'])).toThrow(/--variant/);
    expect(() => parseOptions(['--as-of', '2026-10-07'])).toThrow(/offset/);
  });
});

describe('rng', () => {
  it('replays the same sequence for the same seed or scope', () => {
    const draws = (rng: ReturnType<typeof createRng>) => Array.from({ length: 5 }, () => rng.intInclusive(1, 6));
    expect(draws(createRng(42))).toEqual(draws(createRng(42)));
    expect(draws(rngFor('payments'))).toEqual(draws(rngFor('payments')));
    expect(draws(rngFor('payments'))).not.toEqual(draws(rngFor('invoices')));
  });
});
