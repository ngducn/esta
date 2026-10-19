import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { importFolders, importRoots } from './files';

const refusedFor = (problem: string) => ({ ok: false, reason: { kind: 'file', problem } });

describe('import folders', () => {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'esta-files-')));
  const home = join(base, 'home');
  const root = join(home, 'Esta-import');
  const extra = join(base, 'scans');
  const outside = join(base, 'private');
  let folders: ReturnType<typeof importFolders>;

  beforeAll(async () => {
    for (const folder of [join(root, 'Demo', 'nested'), extra, outside]) mkdirSync(folder, { recursive: true });
    writeFileSync(join(root, 'Demo', 'so-do.jpg'), 'demo photo');
    writeFileSync(join(root, 'Demo', '.DS_Store'), 'finder');
    writeFileSync(join(extra, 'scan.pdf'), 'demo scan');
    writeFileSync(join(outside, 'secret.txt'), 'not for Esta');
    symlinkSync(join(outside, 'secret.txt'), join(root, 'Demo', 'link-out.txt'));
    symlinkSync(join(root, 'Demo', 'so-do.jpg'), join(root, 'Demo', 'link-in.jpg'));
    folders = importFolders(await importRoots(`${extra}${delimiter}${join(base, 'missing')}`, home), home);
  });

  it('reads ~/Esta-import and every folder Ryan added that exists', () => {
    expect(folders.roots).toEqual([root, extra]);
  });

  it('lists one level by name with file sizes, follows a link that stays inside, and leaves hidden files out', async () => {
    expect(await folders.list('~/Esta-import/Demo')).toEqual({
      ok: true,
      value: [
        { name: 'link-in.jpg', kind: 'file', size: 10 },
        { name: 'link-out.txt', kind: 'other' },
        { name: 'nested', kind: 'folder' },
        { name: 'so-do.jpg', kind: 'file', size: 10 },
      ],
    });
  });

  it('reads a file by a path relative to the first folder, by ~ and by an absolute path in an added folder', async () => {
    expect(await folders.read('Demo/so-do.jpg', 100)).toMatchObject({ ok: true, value: { name: 'so-do.jpg', bytes: Buffer.from('demo photo') } });
    expect(await folders.read('~/Esta-import/Demo/link-in.jpg', 100)).toMatchObject({ ok: true, value: { name: 'so-do.jpg' } });
    expect(await folders.read(join(extra, 'scan.pdf'), 100)).toMatchObject({ ok: true, value: { name: 'scan.pdf' } });
  });

  it('refuses a path outside the folders, a symlink that leaves them and a climb out with ..', async () => {
    expect(await folders.read(join(outside, 'secret.txt'), 100)).toEqual(refusedFor('outside_import_folders'));
    expect(await folders.read('Demo/link-out.txt', 100)).toEqual(refusedFor('outside_import_folders'));
    expect(await folders.read('Demo/../../../private/secret.txt', 100)).toEqual(refusedFor('outside_import_folders'));
    expect(await folders.list(outside)).toEqual(refusedFor('outside_import_folders'));
    expect(await folders.read(join(outside, 'missing.txt'), 100), 'what exists outside stays unsaid').toEqual(refusedFor('outside_import_folders'));
  });

  it('refuses a folder read as a file, a file listed as a folder, a missing file and one past the limit', async () => {
    expect(await folders.read('Demo/nested', 100)).toEqual(refusedFor('not_a_file'));
    expect(await folders.list('Demo/so-do.jpg')).toEqual(refusedFor('not_a_file'));
    expect(await folders.read('Demo/missing.jpg', 100)).toEqual(refusedFor('missing'));
    expect(await folders.read('Demo/so-do.jpg', 9)).toEqual(refusedFor('too_large'));
  });

  it('refuses a named pipe at once instead of waiting for a writer', { timeout: 2_000 }, async () => {
    const pipe = join(root, 'Demo', 'pipe');
    expect(spawnSync('mkfifo', [pipe]).status).toBe(0);
    expect(await folders.read('Demo/pipe', 100)).toEqual(refusedFor('not_a_file'));
  });

  it('refuses everything when no import folder exists', async () => {
    const none = importFolders(await importRoots(undefined, join(base, 'nobody')));
    expect(none.roots).toEqual([]);
    expect(await none.read(join(root, 'Demo', 'so-do.jpg'), 100)).toEqual(refusedFor('outside_import_folders'));
  });
});
