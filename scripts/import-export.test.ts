import { describe, expect, it } from 'vitest';
import { EXPORT_TABLES } from '../packages/core/src/export/tables.ts';
import { assertLocal, type ExportSource } from './export-source.ts';
import { contentTypeFor, documentMimes, importScript, quoteTag } from './import-export.ts';
import { differences, missingFiles, report } from './row-counts.ts';

const HOUSEHOLD = '00000000-0000-4000-8000-0000000000aa';
const manifest = { schemaVersion: 1 as const, exportedAt: '2026-11-01T03:00:00.000Z', householdId: HOUSEHOLD, tables: {}, files: 0, parts: ['export.zip'], exporter: { role: 'admin', isOperator: true }, complete: false, withheld: [{ table: 'conversations', rule: 'x' }] };
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

  it('settles a job the backup caught running, so a restored worker never claims it again', () => {
    const jobs = [
      { id: 'j1', household_id: HOUSEHOLD, kind: 'backup_export', status: 'running', locked_by: 'w1', locked_at: '2026-10-08T02:00:00Z', attempts: 1, error: null, finished_at: null },
      { id: 'j2', household_id: HOUSEHOLD, kind: 'ping', status: 'done', locked_by: null, locked_at: null, attempts: 1, error: null, finished_at: '2026-10-08T01:00:00Z' },
    ];
    const text = importScript(source({ households: [{ id: HOUSEHOLD, name: 'Gia đình Demo' }], agent_jobs: jobs }));
    const rows = JSON.parse(/\$esta\$(\[\{"id":"j1".*?\])\$esta\$/s.exec(text)?.[1] ?? '[]') as Record<string, unknown>[];
    expect(rows[0]).toMatchObject({ id: 'j1', status: 'failed', locked_by: null, locked_at: null, error: expect.stringContaining('restored') });
    expect(rows[0]?.finished_at).toBe('2026-10-08T02:00:00Z');
    expect(rows[1]).toMatchObject({ id: 'j2', status: 'done', finished_at: '2026-10-08T01:00:00Z' });
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

describe('contentTypeFor', () => {
  const jpegHead = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
  const documents = documentMimes([
    { storage_path: `${HOUSEHOLD}/d1/scan.jfif`, mime: 'image/jpeg' },
    { storage_path: `${HOUSEHOLD}/d2/tai-lieu`, mime: 'application/pdf' },
  ]);
  const typeOf = (path: string, bytes = new Uint8Array()) => contentTypeFor(path, documents, bytes);

  it('takes the type of a document from its row, whatever its name ends in', () => {
    expect(typeOf(`documents/${HOUSEHOLD}/d1/scan.jfif`)).toBe('image/jpeg');
    expect(typeOf(`documents/${HOUSEHOLD}/d2/tai-lieu`)).toBe('application/pdf');
  });

  it('types the copies made from a document, and property photos, by extension', () => {
    expect(typeOf(`documents/${HOUSEHOLD}/d1/thumb.webp`)).toBe('image/webp');
    expect(typeOf(`property-photos/${HOUSEHOLD}/p1/cover.JPG`)).toBe('image/jpeg');
  });

  it('reads the first bytes of an object no row names and no extension explains', () => {
    expect(typeOf(`documents/${HOUSEHOLD}/orphan/scan.jfif`, jpegHead)).toBe('image/jpeg');
    expect(typeOf(`documents/${HOUSEHOLD}/orphan/x.bin`, new Uint8Array([1, 2]))).toBe('application/octet-stream');
  });
});

describe('missingFiles', () => {
  it('names each exported file the database lacks, and ignores one it holds beyond the export', () => {
    expect(missingFiles(['documents/h/d1/a.pdf', 'documents/h/d2/scan.jfif'], new Set(['documents/h/d1/a.pdf', 'documents/h/d9/extra.pdf']))).toEqual(['documents/h/d2/scan.jfif']);
  });
});

describe('report', () => {
  it('never says the export is complete: it names what the export holds and what it left out', () => {
    const lines = report({ ...manifest, tables: { properties: 7 }, files: 3 }, [], []);
    expect(lines[0]).toBe('tables and files match what this export holds (1 tables, 3 files)');
    expect(lines.join('\n')).toContain('left out of this export, so not compared: conversations');
    expect(lines.join('\n')).not.toMatch(/all tables match/);
  });

  it('says all tables and files match, with nothing withheld, for the nightly backup', () => {
    const backup = { ...manifest, tables: { properties: 7 }, files: 3, exporter: { role: 'service', isOperator: true }, complete: true, withheld: [] };
    expect(report(backup, [], [])).toEqual(['all tables and files match (1 tables, 3 files)', 'nothing was withheld: this is the complete copy']);
  });

  it('still names a difference in a complete copy', () => {
    const backup = { ...manifest, files: 3, complete: true, withheld: [] };
    expect(report(backup, [{ what: 'files', exported: 3, live: 2 }], []).join('\n')).toContain('files: exported 3, database 2');
  });

  it('says nothing matches while a file is missing', () => {
    const lines = report({ ...manifest, files: 2 }, [{ what: 'files', exported: 2, live: 1 }], ['documents/h/d2/scan.jfif']);
    expect(lines.join('\n')).toContain('missing file: documents/h/d2/scan.jfif');
    expect(lines.join('\n')).not.toContain('match what this export holds');
  });
});
