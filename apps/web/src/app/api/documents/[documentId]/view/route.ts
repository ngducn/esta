import { NextResponse } from 'next/server';
import { openDocument } from '@/server/documents/actions';

/** Opens the file through a fresh signed URL and logs the view (DOC-4). A row RLS hides answers 404. */
export async function GET(_request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  const url = await openDocument(documentId, 'view');
  if (url === null) return new NextResponse(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  return new NextResponse(null, { status: 302, headers: { Location: url, 'Cache-Control': 'no-store' } });
}
