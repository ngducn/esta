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

const GATEWAY_ERRORS = new Set([502, 503, 504]);
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * `supabase db reset` restarts Storage, and Kong answers 502 until it is back. A gateway error or a refused connection
 * is retried with doubling delays; any other answer returns at once. Uploads upsert, so a retry rewrites the same bytes.
 */
export async function retrying(
  request: () => Promise<Response>,
  { attempts, firstDelayMs, wait = sleep }: { attempts: number; firstDelayMs: number; wait?: (ms: number) => Promise<void> },
): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    const response = await request().catch((error: unknown) => {
      if (attempt === attempts) throw error;
      return undefined;
    });
    if (response !== undefined && (!GATEWAY_ERRORS.has(response.status) || attempt === attempts)) return response;
    await wait(firstDelayMs * 2 ** (attempt - 1));
  }
}

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

  const ready = await retrying(() => fetch(`${env.SUPABASE_URL}/storage/v1/bucket/${BUCKET}`, { headers }), { attempts: 9, firstDelayMs: 250 });
  if (!ready.ok) throw new Error(`seed-photos: Storage is not ready: ${ready.status} ${await ready.text()}`);

  const response = await retrying(() => fetch(`${env.SUPABASE_URL}/rest/v1/properties?select=cover_photo_path&cover_photo_path=not.is.null`, { headers }), {
    attempts: 5,
    firstDelayMs: 250,
  });
  if (!response.ok) throw new Error(`seed-photos: reading properties failed: ${response.status} ${await response.text()}`);
  const rows = (await response.json()) as { cover_photo_path: string }[];
  const uploads = planPhotoUploads(rows.map((row) => row.cover_photo_path));

  const files = new Map<string, Buffer>();
  for (const { file } of uploads) if (!files.has(file)) files.set(file, await readFile(file));

  await Promise.all(
    uploads.map(async ({ path, file, contentType }) => {
      const upload = await retrying(
        () =>
          fetch(`${env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
            method: 'POST',
            headers: { ...headers, 'content-type': contentType, 'x-upsert': 'true' },
            body: new Uint8Array(files.get(file) ?? []),
          }),
        { attempts: 5, firstDelayMs: 250 },
      );
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
