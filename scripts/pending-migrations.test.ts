import { describe, expect, it } from 'vitest';
import { appliedVersions, pendingMigrations } from './pending-migrations.ts';

const files = ['20261007102000_property_list.sql', '20261007015000_agent_core.sql', 'README.md', '20261007014000_member_display.sql'];

describe('pendingMigrations', () => {
  it('names the migrations a database on an older branch has not applied, oldest first', () => {
    expect(pendingMigrations(files, new Set(['20261007014000']))).toEqual(['20261007015000_agent_core.sql', '20261007102000_property_list.sql']);
  });

  it('is empty when every migration is applied, whatever else the folder holds', () => {
    expect(pendingMigrations(files, new Set(['20261007014000', '20261007015000', '20261007102000', '20261007200000']))).toEqual([]);
  });
});

describe('appliedVersions', () => {
  it('reads the versions the migrations table holds', () => {
    const run = ((_: string, sql: string) => (sql.includes('to_regclass') ? [{ present: true }] : [{ version: '20261007014000' }])) as Parameters<typeof appliedVersions>[1];
    expect([...appliedVersions('w', run)]).toEqual(['20261007014000']);
  });

  it('is empty, without asking for the rows, when a half-reset database has no migrations table', () => {
    const sql: string[] = [];
    const run = ((_: string, text: string) => {
      sql.push(text);
      if (!text.includes('to_regclass')) throw new Error('relation "supabase_migrations.schema_migrations" does not exist');
      return [{ present: false }];
    }) as Parameters<typeof appliedVersions>[1];
    expect(appliedVersions('w', run).size).toBe(0);
    expect(sql).toHaveLength(1);
    expect(pendingMigrations(files, appliedVersions('w', run))).toHaveLength(3);
  });
});
