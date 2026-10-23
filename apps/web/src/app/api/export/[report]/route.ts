import type { IsoDate } from '@esta/core/date';
import { toCsv, type ExportTable } from '@esta/core/export';
import type { Locale } from '@esta/core/format';
import { idSchema, readPropertyDetail } from '@esta/ops';
import { getLocale, getTranslations } from 'next-intl/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readRequestClock } from '@/server/clock';
import { toPdfTable } from '@/server/export/pdf-table';
import { toXlsx } from '@/server/export/xlsx';
import { loadLedgerYear } from '@/server/ledger/load';
import { getCurrentMember } from '@/server/member';
import { isReportKind, loadReport } from '@/server/reports/load';
import { createSessionClient } from '@/server/supabase/server';

export const runtime = 'nodejs';

const yearSchema = z.coerce.number().int().min(2000).max(2100);
const formatSchema = z.object({ format: z.enum(['csv', 'xlsx', 'pdf']) });

const NO_STORE = { 'Cache-Control': 'private, no-store' };

const CONTENT_TYPE = { csv: 'text/csv; charset=utf-8', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pdf: 'application/pdf' } as const;

/** A table to download, with its sheet name, file name, and the title and lines a PDF prints above it. */
type Download = { readonly table: ExportTable; readonly sheet: string; readonly file: string; readonly title: string; readonly notes: readonly string[] };
type Params = Record<string, string>;

async function ledgerDownload(params: Params, householdId: string, today: IsoDate): Promise<Download | null> {
  const query = z.object({ propertyId: idSchema, year: yearSchema }).safeParse(params);
  if (!query.success) return null;
  const property = await readPropertyDetail(await createSessionClient(), householdId, query.data.propertyId);
  if (property === null) return null;
  const { year } = query.data;
  const [{ table }, t] = await Promise.all([loadLedgerYear(householdId, property.id, year, today), getTranslations('ledger')]);
  return {
    table,
    sheet: t('sheet', { year }),
    file: `${property.code.replace(/[^A-Za-z0-9-]+/g, '-')}-thu-chi-${year}`,
    title: t('title', { year }),
    notes: [property.nickname, t('basis')],
  };
}

async function reportDownload(report: string, params: Params, householdId: string, today: IsoDate): Promise<Download | null> {
  const query = z.object({ year: yearSchema.optional() }).safeParse(params);
  if (!query.success || !isReportKind(report)) return null;
  const view = await loadReport(householdId, report, query.data.year ?? Number(today.slice(0, 4)), today);
  return { ...view, notes: view.estimate === null ? [view.basis] : [view.basis, view.estimate] };
}

async function render(download: Download, format: z.output<typeof formatSchema>['format']): Promise<string | Uint8Array<ArrayBuffer>> {
  if (format === 'csv') return toCsv(download.table);
  if (format === 'xlsx') return new Uint8Array(await toXlsx(download.table, download.sheet));
  return new Uint8Array(await toPdfTable(download.table, { title: download.title, notes: download.notes, locale: (await getLocale()) as Locale }));
}

/** One download for every table Esta shows: a property's ledger, or a report on Báo cáo, as CSV, Excel or PDF. */
export async function GET(request: Request, { params }: { params: Promise<{ report: string }> }) {
  const [{ report }, member] = await Promise.all([params, getCurrentMember()]);
  const query = Object.fromEntries(new URL(request.url).searchParams);
  const format = formatSchema.safeParse(query);
  if (member === null || !format.success) return new NextResponse(null, { status: 404, headers: NO_STORE });
  const today = (await readRequestClock()).today();
  const download = report === 'ledger' ? await ledgerDownload(query, member.household.id, today) : await reportDownload(report, query, member.household.id, today);
  if (download === null) return new NextResponse(null, { status: 404, headers: NO_STORE });
  const kind = format.data.format;
  const body = await render(download, kind);
  return new NextResponse(body, { headers: { ...NO_STORE, 'Content-Type': CONTENT_TYPE[kind], 'Content-Disposition': `attachment; filename="${download.file}.${kind}"` } });
}
