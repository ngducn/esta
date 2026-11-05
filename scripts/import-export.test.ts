import { describe, expect, it } from 'vitest';
import { EXPORT_TABLES } from '../packages/core/src/export/tables.ts';
import { assertLocal, type ExportSource } from './export-source.ts';
import { importScript, quoteTag } from './import-export.ts';
import { differences } from './row-counts.ts';

const HOUSEHOLD = '00000000-0000-4000-8000-0000000000aa';
const manifest = { schemaVersion: 1 as const, exportedAt: '2026-11-01T03:00:00.000Z', householdId: HOUSEHOLD, tables: {}, files: 0, parts: ['export.zip'] };
const source = (tables: Record<string, Record<string, unknown>[]>): ExportSource => ({ manifest, tables: new Map(Object.entries(tables)), files: new Map() });

describe('assertLocal', () => {
  it('lets a database and an API on this machine through', () => {
    expect(() => assertLocal('SUPABASE_DB_URL', 'postgresql://postgres:postgres@127.0.0.1:54322/postgres')).not.toThrow();
    expect(() => assertLocal('SUPABASE_URL', 'http://localhost:54321')).not.toThrow();
  });

  it('refuses a hosted database, whatever its name suggests', () => {
    expect(() => assertLocal('SUPABASE_DB_URL', 'postgresql://postgres:secret@db.abcdefgh.supabase.co:5432/postgres')).toThrow(/local database/);
    expect(() => assertLocal('SUPABASE_URL', 'https://localhost.example.com')).toThrow(/local database/);
  });
});

describe('importScript', () => {
  const members = [{ id: 'm1', household_id: HOUSEHOLD, user_id: 'old-auth-user', invited_email: 'me@demo.esta.test', role: 'admin' }];
  const script = importScript(source({ households: [{ id: HOUSEHOLD, name: 'Gia đình Demo' }], household_members: members }));

  it('runs as one statement in one transaction, with the triggers and foreign keys switched off', () => {
    expect(script.startsWith('do $import$\nbegin\nset local session_replication_role = replica;')).toBe(true);
    expect(script.trimEnd().endsWith('$import$;')).toBe(true);
    expect(script.match(/\bcommit\b|\bbegin;/g)).toBeNull();
  });

  it('clears the member user id and keeps the invited email each member reclaims the row by', () => {
    expect(script).toContain('"user_id":null');
    expect(script).not.toContain('old-auth-user');
    expect(script).toContain('"invited_email":"me@demo.esta.test"');
  });

  it('loads tables in registry order, parents first', () => {
    const positions = ['households', 'household_members'].map((name) => script.indexOf(`insert into public.${name} `));
    expect(positions[0]).toBeGreaterThan(-1);
    expect(positions[0]).toBeLessThan(positions[1] ?? -1);
    expect(EXPORT_TABLES.map((table) => table.name).indexOf('households')).toBe(0);
  });

  it('survives text that looks like its own quote tag', () => {
    const hostile = importScript(source({ households: [{ id: HOUSEHOLD, name: 'Nhà $esta$ và $import$' }] }));
    expect(hostile).toContain('$estax$');
    expect(hostile.startsWith('do $importx$')).toBe(true);
  });
});

describe('quoteTag', () => {
  it('adds letters until the tag is absent from the text', () => {
    expect(quoteTag('esta', 'plain')).toBe('$esta$');
    expect(quoteTag('esta', 'has $esta$ and $estax$')).toBe('$estaxx$');
  });
});

describe('differences', () => {
  const counts = { ...manifest, tables: { properties: 7, tasks: 2 }, files: 36 };

  it('is empty when every table and the file count match', () => {
    expect(differences(counts, new Map([['properties', 7], ['tasks', 2], ['files', 36]]))).toEqual([]);
  });

  it('names each table, and the files, that differ', () => {
    expect(differences(counts, new Map([['properties', 6], ['tasks', 2], ['files', 30]]))).toEqual([
      { what: 'properties', exported: 7, live: 6 },
      { what: 'files', exported: 36, live: 30 },
    ]);
  });

  it('counts a table the database lacks as zero rows', () => {
    expect(differences(counts, new Map([['files', 36]])).map((row) => row.what)).toEqual(['properties', 'tasks']);
  });
});
