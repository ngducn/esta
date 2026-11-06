import { describe, expect, it } from 'vitest';
import { baseRefMissing, migrationOrderProblems } from './check-migration-order.ts';

const main = ['20261101000000_a.sql', '20261105000000_b.sql'];

describe('migrationOrderProblems', () => {
  it('passes a migration that sorts after the newest on main', () => {
    expect(migrationOrderProblems([...main, '20261106000000_c.sql'], main)).toEqual([]);
  });

  it('fails a migration that sorts before the newest on main', () => {
    expect(migrationOrderProblems([...main, '20261103000000_c.sql'], main)).toEqual([
      '20261103000000_c.sql sorts at or below 20261105000000_b.sql, the newest migration on origin/main. Rename it to a later timestamp.',
    ]);
  });

  it('fails a migration that shares the newest timestamp', () => {
    expect(migrationOrderProblems([...main, '20261105000000_other.sql'], main)).toHaveLength(1);
  });

  it('passes when the branch adds nothing, even if it is behind main', () => {
    expect(migrationOrderProblems(['20261101000000_a.sql'], main)).toEqual([]);
  });
});

describe('baseRefMissing', () => {
  it('fails in CI, telling it to fetch the base ref', () => {
    expect(baseRefMissing({ CI: 'true' })).toEqual({ exitCode: 1, message: expect.stringContaining('CI must fetch origin/main') });
  });

  it('skips outside CI', () => {
    expect(baseRefMissing({})).toEqual({ exitCode: 0, message: expect.stringContaining('skipped') });
  });
});
