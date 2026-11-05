import { writeExport, zipPartsSink } from '@esta/db/export';
import { NextResponse } from 'next/server';
import { readRequestClock } from '@/server/clock';
import { env } from '@/server/env';
import { getCurrentMember } from '@/server/member';
import { createSessionClient } from '@/server/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const NO_STORE = { 'Cache-Control': 'private, no-store' };
const EXPORTS_BUCKET = 'exports';
const BYTES_PER_MB = 1024 * 1024;

const refuse = (status: number) => new NextResponse(null, { status, headers: NO_STORE });

export async function POST() {
  const member = await getCurrentMember();
  if (member === null) return refuse(401);
  if (member.role !== 'admin') return refuse(403);

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
    const { documentIds } = await writeExport(supabase, householdId, sink, { clock, exporter: { role: member.role, isOperator: member.isOperator } });
    const { error: logError } = await supabase.rpc('log_export_downloads', { p_household_id: householdId, p_document_ids: [...documentIds] });
    if (logError) throw new Error(`Logging the export failed: ${logError.message}`);
    const { data, error } = await stored.createSignedUrls(parts.map((name) => `${householdId}/${name}`), env.ESTA_SIGNED_URL_TTL_SECONDS, { download: true });
    if (error) throw new Error(`Signing the export failed: ${error.message}`);
    const links = data.flatMap(({ path, signedUrl }) => (path === null || signedUrl === null ? [] : [{ name: path.slice(householdId.length + 1), url: signedUrl }]));
    if (links.length !== parts.length) throw new Error('Some parts of the export could not be signed');
    return NextResponse.json({ exportId, ttlSeconds: env.ESTA_SIGNED_URL_TTL_SECONDS, parts: links }, { headers: NO_STORE });
  } catch (error) {
    console.error('export failed', error);
    return refuse(500);
  }
}
