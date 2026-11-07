import { coverPhotoPath } from '@esta/core/properties';
import { describe, expect, it } from 'vitest';
import { propertyCover } from './cover-ops';
import { MAX_COVER_BYTES } from './cover-photo';
import type { LocalContext, LocalFile } from './files';
import { fakeDb, HOUSEHOLD, opContext, PROPERTY, type Sent } from './test/fake-db';

const SHA = 'a'.repeat(64);
const picture: LocalFile = { name: 'mat-tien-demo.jpg', bytes: Uint8Array.from([0xff, 0xd8, 0xff]), size: 48_000, sha256: SHA, mime: 'image/jpeg', pageCount: 1 };
const PATH = 'Demo/mat-tien-demo.jpg';
const OLD = `${HOUSEHOLD}/${PROPERTY}/${'b'.repeat(64)}.webp`;
const NEW = `${HOUSEHOLD}/${PROPERTY}/${SHA}.jpg`;

const home = (cover: string | null) => (request: Sent): readonly unknown[] => (request.table === 'properties' ? [{ id: PROPERTY, nickname: 'Demo Nhà Q1', cover_photo_path: cover }] : []);

function contextWith(rows: (request: Sent) => readonly unknown[], onDisk: Partial<LocalFile> | 'refused' = {}): LocalContext {
  const files = {
    readDocument: async (): Promise<Awaited<ReturnType<LocalContext['files']['readDocument']>>> =>
      onDisk === 'refused' ? { ok: false, reason: { kind: 'file', problem: 'outside_import_folders' } } : { ok: true, value: { ...picture, ...onDisk } },
    previews: async () => {
      throw new Error('a cover has no previews');
    },
  };
  return { ...opContext(fakeDb(rows).db), files };
}

describe('propertyCover', () => {
  it('takes a property and a path, and nothing else', () => {
    expect(propertyCover.input.safeParse({ property_id: PROPERTY, path: PATH }).success).toBe(true);
    expect(propertyCover.input.safeParse({ property_id: PROPERTY, path: PATH, id: PROPERTY }).success).toBe(false);
    expect(propertyCover.input.safeParse({ property_id: 'q1', path: PATH }).success).toBe(false);
    expect(propertyCover.input.safeParse({ property_id: PROPERTY, path: ' ' }).success).toBe(false);
  });

  it('plans the cover as the web app would path it, with the file as hashed and the cover it replaces', async () => {
    const planned = await propertyCover.plan(contextWith(home(OLD)), { property_id: PROPERTY, path: PATH });
    expect(coverPhotoPath(HOUSEHOLD, PROPERTY, `${SHA}.jpg`)).toEqual({ ok: true, value: NEW });
    expect(planned).toEqual({
      ok: true,
      value: { kind: 'change', change: { property_id: PROPERTY, path: PATH, file: { name: picture.name, mime: 'image/jpeg', size: 48_000, sha256: SHA }, before: OLD, after: NEW } },
    });
  });

  it('plans unchanged when the property already shows this picture', async () => {
    expect(await propertyCover.plan(contextWith(home(NEW)), { property_id: PROPERTY, path: PATH })).toEqual({ ok: true, value: { kind: 'unchanged', current: { property_id: PROPERTY, cover_photo_path: NEW } } });
  });

  it.each([
    ['png', 'image/png', `${SHA}.png`],
    ['webp', 'image/webp', `${SHA}.webp`],
  ])('names a %s cover with its own extension', async (_name, mime, object) => {
    const planned = await propertyCover.plan(contextWith(home(null), { mime: mime as LocalFile['mime'] }), { property_id: PROPERTY, path: PATH });
    expect(planned).toMatchObject({ ok: true, value: { change: { before: null, after: `${HOUSEHOLD}/${PROPERTY}/${object}` } } });
  });

  it.each([
    ['a PDF', { mime: 'application/pdf' as const }, { kind: 'file', problem: 'unsupported_type' }],
    ['a picture over the bucket limit', { size: MAX_COVER_BYTES + 1 }, { kind: 'file', problem: 'too_large' }],
    ['a file outside the import folders', 'refused' as const, { kind: 'file', problem: 'outside_import_folders' }],
  ])('refuses %s', async (_name, onDisk, reason) => {
    expect(await propertyCover.plan(contextWith(home(null), onDisk), { property_id: PROPERTY, path: PATH })).toEqual({ ok: false, reason });
  });

  it('refuses a property Esta does not show, before it reads the file', async () => {
    expect(await propertyCover.plan(contextWith(() => []), { property_id: PROPERTY, path: PATH })).toEqual({ ok: false, reason: { kind: 'invalid', issues: [{ path: 'property_id', code: 'not_found' }] } });
  });

  it('sends nothing when the file no longer hashes as it did in the plan', async () => {
    const change = { property_id: PROPERTY, path: PATH, file: { name: picture.name, mime: 'image/jpeg' as const, size: picture.size, sha256: SHA }, before: OLD, after: NEW };
    expect(await propertyCover.apply(contextWith(home(OLD), { sha256: 'c'.repeat(64) }), change)).toEqual({ ok: false, reason: { kind: 'file_changed' } });
  });

  it('shows the property, the file name and its size', async () => {
    const change = { property_id: PROPERTY, path: PATH, file: { name: picture.name, mime: 'image/jpeg' as const, size: 48_000, sha256: SHA }, before: null, after: NEW };
    expect(await propertyCover.preview?.(contextWith(home(null)), change)).toEqual({ property: 'Demo Nhà Q1', file_name: 'mat-tien-demo.jpg', size_display: '47 KB' });
  });
});
