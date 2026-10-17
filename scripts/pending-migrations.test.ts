import { describe, expect, it } from 'vitest';
import { pendingMigrations } from './pending-migrations.ts';

const files = ['20261007102000_property_list.sql', '20261007015000_agent_core.sql', 'README.md', '20261007014000_member_display.sql'];

describe('pendingMigrations', () => {
  it('names the migrations a database on an older branch has not applied, oldest first', () => {
    expect(pendingMigrations(files, new Set(['20261007014000']))).toEqual(['20261007015000_agent_core.sql', '20261007102000_property_list.sql']);
  });

  it('is empty when every migration is applied, whatever else the folder holds', () => {
    expect(pendingMigrations(files, new Set(['20261007014000', '20261007015000', '20261007102000', '20261007200000']))).toEqual([]);
  });
});
