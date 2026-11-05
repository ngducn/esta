import 'server-only';
import { zipPartsSink, type ExportSink } from '@esta/db/export';
import { NextResponse } from 'next/server';
import { readRequestClock } from '@/server/clock';
import { env } from '@/server/env';
import type { Member } from '@/server/member';
import { createSessionClient } from '@/server/supabase/server';

const NO_STORE = { 'Cache-Control': 'private, no-store' };
const EXPORTS_BUCKET = 'exports';
const BYTES_PER_MB = 1024 * 1024;

export const refuseExport = (status: number) => new NextResponse(null, { status, headers: NO_STORE });

export async function storeExport(
  member: Member,
  write: (sink: ExportSink, session: Awaited<ReturnType<typeof createSessionClient>>) => Promise<{ readonly documentIds: readonly string[] }>,
): Promise<NextResponse> {
  const householdId = member.household.id;
  const exportId = crypto.randomUUID();
  const supabase = await createSessionClient();
  const clock = await readRequestClock();
  const stored = supabase.storage.from(EXPORTS_BUCKET);

  const parts: string[] = [];
  const sink = zipPartsSink({
    partBytes: env.ESTA_EXPORT_PART_MB * BYTES_PER_MB,
    partName: (index) => (index === 1 ? `${exportId}.zip` : `${exportId}-part-${index}.zip`),
    upload: async (name, bytes) => {
      const { error } = await stored.upload(`${householdId}/${name}`, bytes, { contentType: 'application/zip' });
      if (error) throw new Error(`Storing ${name} failed: ${error.message}`);
      parts.push(name);
    },
    mtime: Date.parse(clock.now()),
  });

  try {
    const { documentIds } = await write(sink, supabase);
    const { error: logError } = await supabase.rpc('log_export_downloads', { p_household_id: householdId, p_document_ids: [...documentIds] });
    if (logError) throw new Error(`Logging the export failed: ${logError.message}`);
    const { data, error } = await stored.createSignedUrls(parts.map((name) => `${householdId}/${name}`), env.ESTA_SIGNED_URL_TTL_SECONDS, { download: true });
    if (error) throw new Error(`Signing the export failed: ${error.message}`);
    const links = data.flatMap(({ path, signedUrl }) => (path === null || signedUrl === null ? [] : [{ name: path.slice(householdId.length + 1), url: signedUrl }]));
    if (links.length !== parts.length) throw new Error('Some parts of the export could not be signed');
    return NextResponse.json({ exportId, ttlSeconds: env.ESTA_SIGNED_URL_TTL_SECONDS, parts: links }, { headers: NO_STORE });
  } catch (error) {
    console.error('export failed', error);
    return refuseExport(500);
  }
}
