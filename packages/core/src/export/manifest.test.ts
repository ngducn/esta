import { describe, expect, it } from 'vitest';
import { parseInstant } from '../clock/resolve';
import { buildManifest, EXPORT_SCHEMA_VERSION } from './manifest';

const clock = { source: 'table', now: () => parseInstant('2026-10-07T02:00:00Z'), today: () => '2026-10-07' } as const;

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
    const twice = buildManifest({ clock, householdId: 'h', counts: [{ table: 'tasks', rows: 2 }, { table: 'tasks', rows: 5 }], files: 0, parts: ['a.zip'] });
    expect(twice.tables).toEqual({ tasks: 5 });
  });
});
