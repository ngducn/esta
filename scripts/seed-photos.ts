import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseCoverPhotoPath } from '../packages/core/src/properties/cover-photo.ts';
import { parseSlot } from './slot.ts';
import { slotEnv } from './slot-env.ts';

export const BUCKET = 'property-photos';
const PHOTOS_DIR = join(import.meta.dirname, '..', 'supabase', 'seed', 'photos');
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);
const CONTENT_TYPES = { webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' } as const;

export type PhotoUpload = { path: string; file: string; contentType: string };

/** One upload per distinct path, sorted, so a second run sends the same bytes to the same paths. */
export function planPhotoUploads(paths: readonly (string | null)[], photosDir = PHOTOS_DIR): PhotoUpload[] {
  return [...new Set(paths.filter((path): path is string => path !== null))].toSorted().map((path) => {
    const parts = parseCoverPhotoPath(path);
    if (parts === null) throw new Error(`seed-photos: ${path} is not a cover photo path`);
    const extension = parts.name.split('.').at(-1) as keyof typeof CONTENT_TYPES;
    return { path, file: join(photosDir, parts.name), contentType: CONTENT_TYPES[extension] };
  });
}

async function run(): Promise<void> {
  const env = slotEnv(join(import.meta.dirname, '..'), parseSlot(process.env.ESTA_SLOT));
  const host = URL.parse(env.SUPABASE_URL ?? '')?.hostname;
  if (host === undefined || !LOCAL_HOSTS.has(host)) {
    throw new Error(`seed-photos uploads only to a local stack, not ${host ?? env.SUPABASE_URL}`);
  }
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is unknown: start the slot with pnpm db:start or export it');
  const headers = { apikey: key, authorization: `Bearer ${key}`, 'x-esta-actor': 'system:seed-photos' };

  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/properties?select=cover_photo_path&cover_photo_path=not.is.null`, { headers });
  if (!response.ok) throw new Error(`seed-photos: reading properties failed: ${response.status} ${await response.text()}`);
  const rows = (await response.json()) as { cover_photo_path: string }[];
  const uploads = planPhotoUploads(rows.map((row) => row.cover_photo_path));

  const files = new Map<string, Buffer>();
  for (const { file } of uploads) if (!files.has(file)) files.set(file, await readFile(file));

  await Promise.all(
    uploads.map(async ({ path, file, contentType }) => {
      const upload = await fetch(`${env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
        method: 'POST',
        headers: { ...headers, 'content-type': contentType, 'x-upsert': 'true' },
        body: new Uint8Array(files.get(file) ?? []),
      });
      if (!upload.ok) throw new Error(`seed-photos: ${path} failed: ${upload.status} ${await upload.text()}`);
    }),
  );
  console.log(`seed-photos: ${uploads.length} objects in ${BUCKET}`);
}

if (import.meta.main) {
  run().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
