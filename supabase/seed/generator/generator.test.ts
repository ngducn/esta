import { describe, expect, it } from 'vitest';
import { parseInstant } from '../../../packages/core/src/index.ts';
import { NON_BUSINESS_COLUMNS, SEEDED_AUTH_COLUMNS } from '../../../scripts/db-checksum.ts';
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
    expect(insertedRows(sql, 'public.parties')).toHaveLength(12);
    expect(insertedRows(sql, 'public.certificates')).toHaveLength(28);
    expect(insertedRows(sql, 'public.parcels')).toHaveLength(28);
    expect(insertedRows(sql, 'public.structures')).toHaveLength(20);
    expect(insertedRows(sql, 'public.ownership_shares')).toHaveLength(36);
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

  it('marks the database as seeded, which production never is', () => {
    expect(generate(DEFAULT_OPTIONS)).toContain('insert into private.local_stack default values on conflict do nothing;');
  });

  it('stamps every row with --as-of and names the seed as the audit actor', () => {
    const sql = generate(DEFAULT_OPTIONS);
    expect(sql).toContain("select set_config('esta.actor', 'system:seed', true);");
    const statements = sql
      .split(';\n')
      .filter((part) => part.includes('insert into') && !part.includes('private.local_stack'));
    expect(statements.length).toBeGreaterThan(0);
    for (const statement of statements) {
      expect(statement).toMatch(/\(.*created_at, updated_at\) values/);
      for (const row of statement.split('\n').filter((line) => line.startsWith('  ('))) {
        expect(row).toMatch(/'2026-10-07T02:00:00\.000Z', '2026-10-07T02:00:00\.000Z'\),?$/);
      }
    }
  });
});

describe('db:checksum', () => {
  it('covers every auth column the seed writes except the timestamps', () => {
    const sql = generate(DEFAULT_OPTIONS);
    for (const [table, columns] of Object.entries(SEEDED_AUTH_COLUMNS)) {
      const written = new RegExp(`insert into ${table} \\(([^)]+)\\)`).exec(sql)?.[1]?.split(', ');
      expect(written?.filter((column) => !NON_BUSINESS_COLUMNS.includes(column)), table).toEqual(columns);
    }
  });
});

describe('PROPERTY_SEEDS', () => {
  it('keeps every location inside Vietnam and every code unique', () => {
    for (const { location } of PROPERTY_SEEDS) {
      if (location === null) continue;
      expect(location.lat).toBeGreaterThan(8.18);
      expect(location.lat).toBeLessThan(23.39);
      expect(location.lng).toBeGreaterThan(102.14);
      expect(location.lng).toBeLessThan(109.47);
    }
    expect(PROPERTY_SEEDS.filter(({ location }) => location === null).map(({ key }) => key), 'one unpinned property for the map').toEqual(['long-an']);
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

describe('legal seed', () => {
  const sql = generate({ ...DEFAULT_OPTIONS, lanes: 1 });
  const certificates = insertedRows(sql, 'public.certificates');

  it('covers all five certificate forms in each household', () => {
    const forms = certificates.filter((row) => row.includes(`'${seedId('seed:household:lane-1')}'`)).map((row) => /'(so_do_pre2009|so_hong_pre2009|gcn_2009_2024|gcn_2024|paper_only)'/.exec(row)?.[1]);
    expect(new Set(forms)).toEqual(new Set(['so_do_pre2009', 'so_hong_pre2009', 'gcn_2009_2024', 'gcn_2024', 'paper_only']));
  });

  it('mortgages Bảo Lộc to the household bank party for 2.000.000.000 VND', () => {
    const baoLoc = certificates.find((row) => row.includes(`'${seedId('seed:certificate:lane-1:bao-loc')}'`));
    expect(baoLoc).toContain(`'mortgaged', '{"bank_party_id":"${seedId('seed:party:bank-lane-1')}","amount_vnd":2000000000,"registered_on":"2024-03-12"}'`);
    expect(insertedRows(sql, 'public.parties').filter((row) => row.includes("'Ngân hàng Demo'") && row.includes(`'{"bank"}'`))).toHaveLength(2);
  });

  it('leaves the Long An parcel without a number, a map sheet or an area', () => {
    const longAn = insertedRows(sql, 'public.parcels').find((row) => row.includes(`'${seedId('seed:parcel:lane-1:long-an:1')}'`));
    expect(longAn).toContain(`'${seedId('seed:certificate:lane-1:long-an')}', null, null, null, null, '[]'`);
  });
});

describe('ownership seed', () => {
  const shares = insertedRows(generate({ ...DEFAULT_OPTIONS, lanes: 1 }), 'public.ownership_shares');
  const lane1 = (key: string, person: 'me' | 'ryan') => shares.find((row) => row.includes(`'${seedId(`seed:ownership:lane-1:${key}:${person}`)}'`));

  it('splits Thủ Đức and Biên Hòa 50/50, names both on the certificate, and gives Long An to Ryan alone (SPEC §9.3)', () => {
    for (const key of ['thu-duc', 'bien-hoa']) {
      expect(lane1(key, 'me')).toContain(`'${seedId('seed:party:me-lane-1')}', 5000, true,`);
      expect(lane1(key, 'ryan')).toContain(`'${seedId('seed:party:ryan-lane-1')}', 5000, true,`);
    }
    expect(lane1('long-an', 'ryan')).toContain(`'${seedId('seed:party:ryan-lane-1')}', 10000, true, null`);
    expect(lane1('long-an', 'me')).toBeUndefined();
  });

  it('sums every property to 10000 bp', () => {
    const totals = new Map<string, number>();
    for (const row of shares) {
      const [, property, bp] = /^\s*\('[^']+', '[^']+', '([^']+)', '[^']+', (\d+),/.exec(row) ?? [];
      totals.set(property ?? '', (totals.get(property ?? '') ?? 0) + Number(bp));
    }
    expect(totals.size).toBe(14);
    expect([...totals.values()].every((total) => total === 10000)).toBe(true);
  });
});

describe('units seed', () => {
  const sql = generate({ ...DEFAULT_OPTIONS, lanes: 1 });
  const units = insertedRows(sql, 'public.units').filter((row) => row.includes(`'${seedId('seed:household:lane-1')}'`));
  const ofProperty = (key: string) => units.filter((row) => row.includes(`'${seedId(`seed:property:lane-1:${key}`)}'`));
  const rent = (row: string) => Number(/'(?:whole|room|floor|shop|lot)', (?:[0-9.]+|null), ([0-9]+|null),/.exec(row)?.[1]);

  it('gives Dĩ An Phòng 1 to Phòng 8 at 21.400.000 VND in all, with Phòng 8 free from 2026-08-01', () => {
    const rooms = ofProperty('di-an');
    expect(rooms.map((row) => /'(Phòng [0-9]+)'/.exec(row)?.[1])).toEqual(['Phòng 1', 'Phòng 2', 'Phòng 3', 'Phòng 4', 'Phòng 5', 'Phòng 6', 'Phòng 7', 'Phòng 8']);
    expect(rooms.reduce((sum, row) => sum + rent(row), 0)).toBe(21_400_000);
    expect(rooms.filter((row) => row.includes("'2026-08-01'"))).toEqual([rooms[7]]);
  });

  it('writes the rents of q7, thu-duc and bien-hoa onto the whole unit the property trigger creates', () => {
    for (const [key, amount] of [['q7', 15_000_000], ['thu-duc', 9_000_000], ['bien-hoa', 12_000_000]] as const) {
      const [row] = ofProperty(key);
      expect(row).toContain(`'${seedId(`esta:unit:whole:${seedId(`seed:property:lane-1:${key}`)}`)}'`);
      expect(rent(row ?? '')).toBe(amount);
    }
    expect(sql).toMatch(/insert into public\.units [^;]*\non conflict \(id\) do update set household_id = excluded\.household_id, [^;]*list_rent_vnd = excluded\.list_rent_vnd/);
  });

  it('seeds an electricity and a water account for every property except Quận 1, whose tenant holds them', () => {
    const accounts = insertedRows(sql, 'public.utility_accounts').filter((row) => row.includes(`'${seedId('seed:household:lane-1')}'`));
    expect(accounts).toHaveLength(8);
    expect(accounts.some((row) => row.includes(`'${seedId('seed:property:lane-1:q1')}'`))).toBe(false);
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
