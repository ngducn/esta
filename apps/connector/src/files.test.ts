import { spawnSync } from 'node:child_process';
import { chmodSync, linkSync, mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
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
    symlinkSync(outside, join(root, 'Demo', 'link-dir'));
    symlinkSync(join(outside, 'gone.txt'), join(root, 'Demo', 'dangling-out.txt'));
    symlinkSync(join(root, 'Demo', 'gone.jpg'), join(root, 'Demo', 'dangling-in.jpg'));
    linkSync(join(outside, 'secret.txt'), join(root, 'Demo', 'hard.txt'));
    writeFileSync(join(root, 'Demo', 'hop-dong-demo-079123456789.pdf'), 'demo lease');
    symlinkSync(join(root, 'Demo', 'hop-dong-demo-079123456789.pdf'), join(root, 'Demo', 'hop-dong-demo.pdf'));
    mkdirSync(join(root, 'Broken', 'locked'), { recursive: true });
    writeFileSync(join(root, 'Broken', 'locked', 'x.csv'), 'a,b');
    writeFileSync(join(root, 'Broken', 'ghi-chu.csv'), 'a,b');
    writeFileSync(join(root, 'Broken', 'khoa.csv'), 'a,b');
    symlinkSync(join(root, 'Broken', 'loop-b'), join(root, 'Broken', 'loop-a'));
    symlinkSync(join(root, 'Broken', 'loop-a'), join(root, 'Broken', 'loop-b'));
    chmodSync(join(root, 'Broken', 'locked'), 0o000);
    chmodSync(join(root, 'Broken', 'khoa.csv'), 0o000);
    folders = importFolders(await importRoots(`${extra}${delimiter}${join(base, 'missing')}`, home), home);
  });

  it('reads ~/Esta-import and every folder Ryan added that exists', () => {
    expect(folders.roots).toEqual([root, extra]);
  });

  it('lists one level by name with file sizes, follows a link that stays inside, and leaves hidden files out', async () => {
    expect(await folders.list('~/Esta-import/Demo')).toEqual({
      ok: true,
      value: [
        { name: 'dangling-in.jpg', kind: 'refused', problem: 'missing' },
        { name: 'dangling-out.txt', kind: 'refused', problem: 'outside_import_folders' },
        { name: 'hard.txt', kind: 'refused', problem: 'outside_import_folders' },
        { name: 'hop-dong-demo-079123456789.pdf', kind: 'refused', problem: 'id_number_in_name' },
        { name: 'hop-dong-demo.pdf', kind: 'refused', problem: 'id_number_in_name' },
        { name: 'link-dir', kind: 'refused', problem: 'outside_import_folders' },
        { name: 'link-in.jpg', kind: 'file', size: 10 },
        { name: 'link-out.txt', kind: 'refused', problem: 'outside_import_folders' },
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

  it('answers outside for any path through a link that leaves the folders, whether or not the file exists there', async () => {
    expect(await folders.read('Demo/link-dir/secret.txt', 100)).toEqual(refusedFor('outside_import_folders'));
    expect(await folders.read('Demo/link-dir/missing.txt', 100)).toEqual(refusedFor('outside_import_folders'));
    expect(await folders.list('Demo/link-dir/missing')).toEqual(refusedFor('outside_import_folders'));
    expect(await folders.read('Demo/dangling-out.txt', 100)).toEqual(refusedFor('outside_import_folders'));
    expect(await folders.read('Demo/dangling-in.jpg', 100)).toEqual(refusedFor('missing'));
  });

  it('refuses a hard link to a file, which may also live outside the folders', async () => {
    expect(await folders.read('Demo/hard.txt', 100)).toEqual(refusedFor('outside_import_folders'));
  });

  it('refuses a path whose name holds a full ID number, which Esta never stores, under its own name or through a link', async () => {
    expect(await folders.read('Demo/hop-dong-demo-079123456789.pdf', 100)).toEqual(refusedFor('id_number_in_name'));
    expect(await folders.read('Demo/hop-dong-demo.pdf', 100)).toEqual(refusedFor('id_number_in_name'));
  });

  it('lists a folder that holds a link loop and unreadable entries, marking each without the error the system gave', async () => {
    expect(await folders.list('Broken')).toEqual({
      ok: true,
      value: [
        { name: 'ghi-chu.csv', kind: 'file', size: 3 },
        { name: 'khoa.csv', kind: 'file', size: 3 },
        { name: 'locked', kind: 'folder' },
        { name: 'loop-a', kind: 'refused', problem: 'unreadable' },
        { name: 'loop-b', kind: 'refused', problem: 'unreadable' },
      ],
    });
    expect(await folders.read('Broken/loop-a', 100)).toEqual(refusedFor('unreadable'));
    expect(await folders.read('Broken/khoa.csv', 100)).toEqual(refusedFor('unreadable'));
    expect(await folders.read('Broken/locked/x.csv', 100)).toEqual(refusedFor('unreadable'));
    expect(await folders.list('Broken/locked')).toEqual(refusedFor('unreadable'));
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
