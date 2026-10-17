import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const dynamic = 'force-static';

/**
 * MapLibre finds its worker beside its own module URL, which a bundled chunk does not have, so the map sets this URL.
 * Built once at `next build`, from `apps/web`; the worker is MapLibre's own file, served from this origin (SPEC D10 adds no other host).
 */
export async function GET(): Promise<Response> {
  const worker = await readFile(join(process.cwd(), 'node_modules', 'maplibre-gl', 'dist', 'maplibre-gl-worker.mjs'), 'utf8');
  return new Response(worker, { headers: { 'content-type': 'text/javascript; charset=utf-8' } });
}
