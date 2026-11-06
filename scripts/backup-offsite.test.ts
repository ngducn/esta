import { mkdirSync, mkdtempSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { offsitePlan } from './backup-offsite.ts';

const folder = mkdtempSync(join(tmpdir(), 'backup-offsite-'));

describe('offsitePlan', () => {
  it('refuses when the destination is unset or blank', () => {
    expect(offsitePlan({ ESTA_BACKUP_DIR: folder })).toEqual({ refusal: expect.stringContaining('ESTA_BACKUP_OFFSITE is not set') });
    expect(offsitePlan({ ESTA_BACKUP_DIR: folder, ESTA_BACKUP_OFFSITE: '  ' })).toEqual({ refusal: expect.stringContaining('ESTA_BACKUP_OFFSITE is not set') });
  });

  it('refuses when the backup folder is unset or missing', () => {
    expect(offsitePlan({ ESTA_BACKUP_OFFSITE: '/Volumes/demo' })).toEqual({ refusal: expect.stringContaining('ESTA_BACKUP_DIR is not set') });
    expect(offsitePlan({ ESTA_BACKUP_DIR: join(folder, 'nope'), ESTA_BACKUP_OFFSITE: '/Volumes/demo' })).toEqual({ refusal: expect.stringContaining('does not exist') });
  });

  it('copies the folder contents to the destination, trailing slashes normalised', () => {
    expect(offsitePlan({ ESTA_BACKUP_DIR: `${folder}/`, ESTA_BACKUP_OFFSITE: '/Volumes/demo/' })).toEqual({ args: ['-a', '--', `${folder}/`, '/Volumes/demo/'] });
  });

  it('refuses a destination equal to the backup folder, even through a symlink or ..', () => {
    const link = join(tmpdir(), `offsite-link-${process.pid}`);
    symlinkSync(folder, link);
    for (const to of [folder, `${folder}/`, link, join(folder, 'sub', '..')]) {
      mkdirSync(join(folder, 'sub'), { recursive: true });
      expect(offsitePlan({ ESTA_BACKUP_DIR: folder, ESTA_BACKUP_OFFSITE: to })).toEqual({ refusal: expect.stringContaining('the same folder') });
    }
  });

  it('refuses a destination inside the backup folder', () => {
    mkdirSync(join(folder, 'offsite'), { recursive: true });
    expect(offsitePlan({ ESTA_BACKUP_DIR: folder, ESTA_BACKUP_OFFSITE: join(folder, 'offsite') })).toEqual({ refusal: expect.stringContaining('inside the backup folder') });
    expect(offsitePlan({ ESTA_BACKUP_DIR: folder, ESTA_BACKUP_OFFSITE: join(folder, 'not', 'yet') })).toEqual({ refusal: expect.stringContaining('inside the backup folder') });
  });

  it('refuses a destination inside the repo working tree', () => {
    const repo = join(import.meta.dirname, '..');
    expect(offsitePlan({ ESTA_BACKUP_DIR: folder, ESTA_BACKUP_OFFSITE: join(repo, 'backups') })).toEqual({ refusal: expect.stringContaining('inside the repo') });
    expect(offsitePlan({ ESTA_BACKUP_DIR: folder, ESTA_BACKUP_OFFSITE: repo })).toEqual({ refusal: expect.stringContaining('inside the repo') });
  });

  it('leaves an rsync target alone', () => {
    expect(offsitePlan({ ESTA_BACKUP_DIR: folder, ESTA_BACKUP_OFFSITE: 'ryan@host:/backups/esta' })).toEqual({ args: ['-a', '--', `${folder}/`, 'ryan@host:/backups/esta/'] });
  });
});
