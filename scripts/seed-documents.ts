import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { thumbBlurPath, thumbPath } from '../packages/core/src/documents/storage-path.ts';
import { SEED_DOCUMENT_FILES, type SeedDocumentName } from '../supabase/seed/generator/documents.ts';
import { listObjects, removeObjects, retrying, stalePaths } from './seed-photos.ts';
import { parseSlot } from './slot.ts';
import { slotEnv } from './slot-env.ts';

export const BUCKET = 'documents';
const repoRoot = join(import.meta.dirname, '..');
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);
/** The browser's `makeThumbnails` uses the same long side and blur radius. */
export const THUMB_SIZE = 320;
export const BLUR_SIGMA = 24;

export type DocumentUpload =
  | { readonly path: string; readonly kind: 'file'; readonly file: string; readonly contentType: string }
  | { readonly path: string; readonly kind: 'thumb' | 'thumb-blur'; readonly file: string; readonly contentType: 'image/webp' };

const isSeedName = (name: string): name is SeedDocumentName => Object.hasOwn(SEED_DOCUMENT_FILES, name);

/**
 * The file and both thumbnails for every seeded row, sorted by path, so a second run plans the same uploads. A row
 * uploaded through the app has no seed file and is skipped.
 */
export function planDocumentUploads(storagePaths: readonly string[]): DocumentUpload[] {
  return [...new Set(storagePaths)].toSorted().flatMap((storagePath): DocumentUpload[] => {
    const [householdId = '', documentId = '', name = ''] = storagePath.split('/');
    if (!isSeedName(name)) return [];
    const source = SEED_DOCUMENT_FILES[name];
    return [
      { path: storagePath, kind: 'file', file: join(repoRoot, source.file), contentType: source.mime },
      { path: thumbPath(householdId, documentId), kind: 'thumb', file: join(repoRoot, source.preview), contentType: 'image/webp' },
      { path: thumbBlurPath(householdId, documentId), kind: 'thumb-blur', file: join(repoRoot, source.preview), contentType: 'image/webp' },
    ];
  });
}

async function bytesFor(upload: DocumentUpload, cache: Map<string, Promise<Buffer>>): Promise<Buffer> {
  const key = `${upload.kind}:${upload.file}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const made = readFile(upload.file).then((bytes) => {
    if (upload.kind === 'file') return bytes;
    const resized = sharp(bytes).rotate().resize(THUMB_SIZE, THUMB_SIZE, { fit: 'inside' });
    return (upload.kind === 'thumb-blur' ? resized.blur(BLUR_SIGMA) : resized).webp({ quality: 70 }).toBuffer();
  });
  cache.set(key, made);
  return made;
}

async function run(): Promise<void> {
  const env = slotEnv(process.env.ESTA_SLOT_ROOT ?? repoRoot, parseSlot(process.env.ESTA_SLOT));
  const url = env.SUPABASE_URL ?? '';
  const host = URL.parse(url)?.hostname;
  if (host === undefined || !LOCAL_HOSTS.has(host)) throw new Error(`seed-documents uploads only to a local stack, not ${host ?? url}`);
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is unknown: start the slot with pnpm db:start or export it');
  const headers = { apikey: key, authorization: `Bearer ${key}`, 'x-esta-actor': 'system:seed' };

  const ready = await retrying(() => fetch(`${url}/storage/v1/bucket/${BUCKET}`, { headers }), { attempts: 9, firstDelayMs: 250 });
  if (!ready.ok) throw new Error(`seed-documents: Storage is not ready: ${ready.status} ${await ready.text()}`);

  const response = await retrying(() => fetch(`${url}/rest/v1/documents?select=storage_path`, { headers }), { attempts: 5, firstDelayMs: 250 });
  if (!response.ok) throw new Error(`seed-documents: reading documents failed: ${response.status} ${await response.text()}`);
  const rows = (await response.json()) as { storage_path: string }[];
  const uploads = planDocumentUploads(rows.map((row) => row.storage_path));

  const cache = new Map<string, Promise<Buffer>>();
  for (let start = 0; start < uploads.length; start += 24) {
    await Promise.all(
      uploads.slice(start, start + 24).map(async (upload) => {
        const body = new Uint8Array(await bytesFor(upload, cache));
        const sent = await retrying(
          () =>
            fetch(`${url}/storage/v1/object/${BUCKET}/${upload.path}`, {
              method: 'POST',
              headers: { ...headers, 'content-type': upload.contentType, 'x-upsert': 'true' },
              body,
            }),
          { attempts: 5, firstDelayMs: 250 },
        );
        if (!sent.ok) throw new Error(`seed-documents: ${upload.path} failed: ${sent.status} ${await sent.text()}`);
      }),
    );
  }
  const wanted = rows.flatMap(({ storage_path }) => {
    const [householdId = '', documentId = ''] = storage_path.split('/');
    return [storage_path, thumbPath(householdId, documentId), thumbBlurPath(householdId, documentId)];
  });
  const stale = stalePaths(await listObjects(url, headers, '', BUCKET), wanted);
  await removeObjects(url, headers, stale, BUCKET);
  console.log(`seed-documents: ${uploads.length} objects in ${BUCKET}, removed ${stale.length} stale`);
}

if (import.meta.main) {
  run().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
