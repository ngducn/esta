import type { ReceiptKind } from '@esta/core/receipt';
import { idSchema } from '@esta/ops';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readRequestClock } from '@/server/clock';
import { getCurrentMember } from '@/server/member';
import { loadReceipt } from '@/server/receipts/load';
import { renderReceiptPdf } from '@/server/receipts/pdf';
import { renderReceiptPng } from '@/server/receipts/png';

export const runtime = 'nodejs';

const paramsSchema = z.object({ invoiceId: idSchema });
const formatSchema = z.enum(['pdf', 'png']).catch('pdf');

const NO_STORE = { 'Cache-Control': 'private, no-store' };

const FILE_PREFIX: Readonly<Record<ReceiptKind, string>> = { notice: 'thong-bao', receipt: 'bien-nhan' };

/** A file name a phone and Zalo keep as typed: ASCII letters, digits and dashes only. */
const fileName = (kind: ReceiptKind, number: string, format: 'pdf' | 'png') => `${FILE_PREFIX[kind]}-${number.replace(/[^A-Za-z0-9-]+/g, '-')}.${format}`;

/**
 * LSE-6: `?format=pdf` is the A5 receipt, `?format=png` the picture for Zalo, each a notice while nothing is received.
 * The bill is read with the member's session, so a bill of another household, a draft or a voided one answers 404.
 */
export async function GET(request: Request, { params }: { params: Promise<{ invoiceId: string }> }) {
  const parsed = paramsSchema.safeParse(await params);
  const member = parsed.success ? await getCurrentMember() : null;
  if (!parsed.success || member === null) return new NextResponse(null, { status: 404, headers: NO_STORE });
  const clock = await readRequestClock();
  const receipt = await loadReceipt(member, parsed.data.invoiceId, clock.today());
  if (receipt === null) return new NextResponse(null, { status: 404, headers: NO_STORE });
  const format = formatSchema.parse(new URL(request.url).searchParams.get('format'));
  const body = format === 'png' ? await renderReceiptPng(receipt) : await renderReceiptPdf(receipt);
  return new NextResponse(new Uint8Array(body), {
    headers: {
      ...NO_STORE,
      'Content-Type': format === 'png' ? 'image/png' : 'application/pdf',
      'Content-Disposition': `inline; filename="${fileName(receipt.kind, receipt.number, format)}"`,
    },
  });
}
