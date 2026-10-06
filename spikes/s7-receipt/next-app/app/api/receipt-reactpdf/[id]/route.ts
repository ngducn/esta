import { renderReactPdf } from '../../../../lib/reactpdf.tsx';
import { renderPng } from '../../../../lib/png.tsx';

export const runtime = 'nodejs';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const format = new URL(req.url).searchParams.get('format') ?? 'pdf';
  const start = performance.now();
  const body = format === 'png' ? await renderPng() : await renderReactPdf();
  const ms = Math.round(performance.now() - start);
  return new Response(new Uint8Array(body), {
    headers: {
      'content-type': format === 'png' ? 'image/png' : 'application/pdf',
      'content-disposition': `inline; filename="bien-nhan-${id}.${format}"`,
      'server-timing': `gen;dur=${ms}`,
    },
  });
}
