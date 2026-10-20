import type { Clock } from '@esta/core';
import { describe, expect, it } from 'vitest';
import type { Db } from './db';
import { documentAttach } from './document-attach';
import type { LocalContext, LocalFile, LocalFiles } from './files';
import { runOp, type OpContext } from './op';

const file: LocalFile = { name: 'so-do.jpg', bytes: Uint8Array.from([0xff, 0xd8, 0xff]), size: 3, sha256: 'a'.repeat(64), mime: 'image/jpeg', pageCount: 1 };

/** Any query or upload throws: an attachment whose file changed must be refused before one runs. */
const untouchable = new Proxy({}, { get: () => () => { throw new Error('nothing may reach the database'); } }) as Db;

function contextWith(onDisk: LocalFile): LocalContext {
  const files: LocalFiles = {
    readDocument: async () => ({ ok: true, value: onDisk }),
    previews: async () => { throw new Error('no previews for a changed file'); },
  };
  return { db: untouchable, householdId: '5a7ba01a-8719-4c6b-a777-0000000000aa', clock: {} as Clock, files };
}

const attachment = {
  id: '5a7ba01a-8719-4c6b-a777-0000000000bb',
  path: 'Demo/so-do.jpg',
  file: { name: file.name, mime: file.mime, size: file.size, sha256: file.sha256, pageCount: 1 },
  property_id: '5a7ba01a-8719-4c6b-a777-0000000000cc',
  lease_id: null,
  category: 'certificate',
  title: 'Sổ đỏ Demo Củ Chi',
  expires_on: null,
} as const;

describe('documentAttach', () => {
  it('sends nothing when the file no longer hashes as it did in the plan', async () => {
    expect(await documentAttach.apply(contextWith({ ...file, sha256: 'b'.repeat(64) }), attachment)).toEqual({ ok: false, reason: { kind: 'file_changed' } });
  });

  it('cannot run where no files are, as in a server action', () => {
    const serverAction = async (ctx: OpContext) =>
      // @ts-expect-error a server action has no LocalContext, so it cannot attach a file from Ryan's Mac
      runOp(documentAttach, ctx, {});
    expect(serverAction).toBeTypeOf('function');
  });
});
