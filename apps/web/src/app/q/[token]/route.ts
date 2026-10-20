import { NextResponse } from 'next/server';
import { z } from 'zod';
import { loadSharedQr, renderSharedQrPng } from '@/server/invoices/shared-qr';

export const runtime = 'nodejs';

const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{22}$/);

/** The amount owed changes with each payment, so nothing keeps a copy, and a search engine never lists the link. */
const HEADERS = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' };

/**
 * LSE-11: the QR picture a reminder links to, for a tenant who has no account. It answers 404 for a malformed or unknown
 * token and for a bill that was voided, whose token is gone.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = tokenSchema.safeParse((await params).token);
  const shared = token.success ? await loadSharedQr(token.data) : null;
  if (shared === null) return new NextResponse(null, { status: 404, headers: HEADERS });
  const png = await renderSharedQrPng(shared);
  return new NextResponse(new Uint8Array(png), {
    headers: { ...HEADERS, 'Content-Type': 'image/png', 'Content-Disposition': 'inline; filename="ma-qr-chuyen-khoan.png"' },
  });
}
