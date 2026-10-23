import { toCsv } from '@esta/core/export';
import { idSchema, readPropertyDetail } from '@esta/ops';
import { getTranslations } from 'next-intl/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readRequestClock } from '@/server/clock';
import { toXlsx } from '@/server/export/xlsx';
import { loadLedgerYear } from '@/server/ledger/load';
import { getCurrentMember } from '@/server/member';
import { createSessionClient } from '@/server/supabase/server';

export const runtime = 'nodejs';

const querySchema = z.object({
  propertyId: idSchema,
  year: z.coerce.number().int().min(2000).max(2100),
  format: z.enum(['csv', 'xlsx']),
});

const NO_STORE = { 'Cache-Control': 'private, no-store' };

const CONTENT_TYPE = { csv: 'text/csv; charset=utf-8', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } as const;

export async function GET(request: Request) {
  const query = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  const member = query.success ? await getCurrentMember() : null;
  const property = query.success && member !== null ? await readPropertyDetail(await createSessionClient(), member.household.id, query.data.propertyId) : null;
  if (!query.success || member === null || property === null) return new NextResponse(null, { status: 404, headers: NO_STORE });
  const { year, format } = query.data;
  const [clock, t] = await Promise.all([readRequestClock(), getTranslations('ledger')]);
  const { table } = await loadLedgerYear(member.household.id, property.id, year, clock.today());
  const body = format === 'csv' ? toCsv(table) : new Uint8Array(await toXlsx(table, t('sheet', { year })));
  const name = `${property.code.replace(/[^A-Za-z0-9-]+/g, '-')}-thu-chi-${year}.${format}`;
  return new NextResponse(body, { headers: { ...NO_STORE, 'Content-Type': CONTENT_TYPE[format], 'Content-Disposition': `attachment; filename="${name}"` } });
}
