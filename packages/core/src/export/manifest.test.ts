import { describe, expect, it } from 'vitest';
import { parseInstant } from '../clock/resolve';
import { isoDate } from '../date/iso-date';
import { buildManifest, EXPORT_SCHEMA_VERSION } from './manifest';

const clock = { source: 'table', now: () => parseInstant('2026-10-07T02:00:00Z'), today: () => isoDate('2026-10-07') } as const;

describe('buildManifest', () => {
  const manifest = buildManifest({
    clock,
    householdId: '00000000-0000-4000-8000-000000000001',
    counts: [
      { table: 'households', rows: 1 },
      { table: 'properties', rows: 7 },
    ],
    files: 12,
    parts: ['a.zip', 'a-part-2.zip'],
    exporter: { role: 'admin', isOperator: false },
  });

  it('dates the export from the Clock, not from the machine', () => {
    expect(manifest.exportedAt).toBe('2026-10-07T02:00:00.000Z');
  });

  it('keeps the schema version, the household, one count per table and every part', () => {
    expect(manifest).toMatchObject({
      schemaVersion: EXPORT_SCHEMA_VERSION,
      householdId: '00000000-0000-4000-8000-000000000001',
      tables: { households: 1, properties: 7 },
      files: 12,
      parts: ['a.zip', 'a-part-2.zip'],
    });
  });

  it('counts a table once even when a caller lists it twice', () => {
    const twice = buildManifest({ clock, householdId: 'h', counts: [{ table: 'tasks', rows: 2 }, { table: 'tasks', rows: 5 }], files: 0, parts: ['a.zip'], exporter: { role: 'admin', isOperator: true } });
    expect(twice.tables).toEqual({ tasks: 5 });
  });

  it('names the exporter and says the file is what that session could read, not the whole household', () => {
    expect(manifest.exporter).toEqual({ role: 'admin', isOperator: false });
    expect(manifest.complete).toBe(false);
  });

  it('lists what an admin who is not the operator cannot read', () => {
    expect(manifest.withheld.map((entry) => entry.table)).toEqual(['agent_jobs', 'agent_items', 'agent_runs', 'audit_log', 'conversations', 'notifications', 'messages']);
    expect(manifest.withheld.every((entry) => entry.rule.length > 20)).toBe(true);
  });

  it('lists only the private chats and their audit rows for the operator', () => {
    const operator = buildManifest({ clock, householdId: 'h', counts: [], files: 0, parts: ['a.zip'], exporter: { role: 'admin', isOperator: true } });
    expect(operator.withheld.map((entry) => entry.table)).toEqual(['audit_log', 'conversations', 'notifications', 'messages']);
  });

  it('says complete and withholds nothing for the backup, which reads every row with the service role', () => {
    const backup = buildManifest({ clock, householdId: 'h', counts: [], files: 0, parts: ['2026-10-07'], exporter: { role: 'service', isOperator: true }, complete: true });
    expect(backup.complete).toBe(true);
    expect(backup.withheld).toEqual([]);
  });
});
