import { mkdtempSync } from 'node:fs';
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
});
