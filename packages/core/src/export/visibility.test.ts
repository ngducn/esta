import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EXPORT_TABLES, withheldKinds, withheldTables } from './tables';

/** The tables supabase/tests/export_visibility.test.sql found with a SELECT policy narrower than the household. */
function narrowedInDatabase(): string[] {
  const sql = readFileSync(join(import.meta.dirname, '../../../../supabase/tests/export_visibility.test.sql'), 'utf8');
  const values = /\$\$ values (.*) \$\$,/.exec(sql)?.[1] ?? '';
  return [...values.matchAll(/\('(\w+)'\)/g)].map((match) => match[1] ?? '');
}

describe('export visibility', () => {
  it('marks as narrowed exactly the tables the database policies narrow', () => {
    const database = narrowedInDatabase();
    expect(database.length, 'the pgTAP list was read').toBeGreaterThan(3);
    expect(EXPORT_TABLES.filter((table) => table.visibility !== 'household').map((table) => table.name).sort()).toEqual(database.sort());
  });

  it('withholds the assistant records from an admin who is not the operator, and only the chats and their audit rows from the operator', () => {
    expect(withheldKinds(false)).toEqual(new Set(['operator', 'operatorItems', 'chats', 'own', 'audit']));
    expect(withheldKinds(true)).toEqual(new Set(['chats', 'own', 'audit']));
    expect(withheldTables(true).map((entry) => entry.table)).toEqual(['audit_log', 'conversations', 'notifications', 'messages']);
  });
});
