'use client';

import { ZoomIn, ZoomOut } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const ZOOMS = [1, 1.5, 2, 3] as const;
/** Rendered once at this width and scaled by CSS, so zooming never re-renders a page. */
const RENDER_WIDTH = 1600;

type PdfDocument = { numPages: number; getPage(n: number): Promise<PdfPage> };
type PdfTask = { promise: Promise<PdfDocument>; destroy(): Promise<void> };
type PdfPage = {
  getViewport(options: { scale: number }): { width: number; height: number };
  render(options: { canvas: HTMLCanvasElement; viewport: { width: number; height: number } }): { promise: Promise<void> };
};

/** pdf.js loads only here, by dynamic import, so it never reaches the route's initial chunk. */
async function openPdf(url: string): Promise<PdfTask> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerPort ??= new Worker(new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url), { type: 'module' });
  return pdfjs.getDocument({ url }) as unknown as PdfTask;
}

function PdfPageCanvas({ pdf, page, label }: { pdf: PdfDocument; page: number; label: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    let live = true;
    void pdf.getPage(page).then(async (loaded) => {
      const target = canvas.current;
      if (!live || target === null) return;
      const base = loaded.getViewport({ scale: 1 });
      const viewport = loaded.getViewport({ scale: RENDER_WIDTH / base.width });
      target.width = Math.round(viewport.width);
      target.height = Math.round(viewport.height);
      await loaded.render({ canvas: target, viewport }).promise;
      if (live) setDrawn(true);
    });
    return () => {
      live = false;
    };
  }, [pdf, page]);
  return <canvas ref={canvas} role="img" aria-label={label} data-testid="document-page" data-drawn={drawn} className="block h-auto w-full bg-surface" />;
}

/**
 * The document beside its fields: page tabs, zoom, and the page a field was read from. A photo is one page; a PDF's
 * pages are drawn by pdf.js on demand.
 */
export function DocumentPager({
  fileUrl: renderedUrl,
  mime,
  pageCount,
  title,
  page,
  onPage,
}: {
  fileUrl: string | null;
  mime: string;
  pageCount: number;
  title: string;
  page: number;
  onPage: (page: number) => void;
}) {
  const t = useTranslations('extraction');
  // Each server render signs a new URL; the first one stays, so a refresh never reloads the pages already drawn.
  const [fileUrl] = useState(renderedUrl);
  const [zoom, setZoom] = useState(0);
  const [pdf, setPdf] = useState<PdfDocument | null>(null);
  const [failed, setFailed] = useState(fileUrl === null);
  const isPdf = mime === 'application/pdf';
  const pages = pdf?.numPages ?? (isPdf ? pageCount : 1);
  const shown = Math.min(Math.max(page, 1), pages);
  const label = t('documentAlt', { title, page: shown });

  useEffect(() => {
    if (!isPdf || fileUrl === null) return;
    let task: PdfTask | null = null;
    let live = true;
    openPdf(fileUrl)
      .then((opened) => {
        task = opened;
        return opened.promise;
      })
      .then(
        (loaded) => live && setPdf(loaded),
        () => live && setFailed(true),
      );
    return () => {
      live = false;
      void task?.destroy();
    };
  }, [fileUrl, isPdf]);

  return (
    <div data-testid="document-pager" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {pages > 1 ? (
          <div role="tablist" aria-label={t('pageTabs')} className="flex flex-wrap gap-2">
            {Array.from({ length: pages }, (_, index) => index + 1).map((number) => (
              <button
                key={number}
                type="button"
                role="tab"
                aria-selected={number === shown}
                data-testid="page-tab"
                onClick={() => onPage(number)}
                className={cn(
                  'min-h-touch rounded-sm border px-3 text-small font-semibold',
                  number === shown ? 'border-ink bg-ink text-surface' : 'border-rule-strong bg-surface text-ink hover:bg-surface-2',
                )}
              >
                {t('page', { page: number })}
              </button>
            ))}
          </div>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="outline" disabled={zoom === 0} onClick={() => setZoom((step) => Math.max(0, step - 1))}>
            <ZoomOut aria-hidden="true" />
            {t('zoomOut')}
          </Button>
          <Button type="button" variant="outline" data-testid="zoom-in" disabled={zoom === ZOOMS.length - 1} onClick={() => setZoom((step) => Math.min(ZOOMS.length - 1, step + 1))}>
            <ZoomIn aria-hidden="true" />
            {t('zoomIn')}
          </Button>
        </div>
      </div>
      <div tabIndex={0} aria-label={label} className="max-h-[70vh] overflow-auto rounded-md border border-rule bg-surface-2 lg:max-h-[calc(100vh-12rem)]">
        <div style={{ width: `${(ZOOMS[zoom] ?? 1) * 100}%` }}>
          {failed || fileUrl === null ? (
            <p role="alert" className="p-4 text-body text-overdue">
              {t('documentUnavailable')}
            </p>
          ) : isPdf ? (
            pdf === null ? (
              <p role="status" className="p-4 text-body text-ink-muted">
                {t('pageLoading', { page: shown })}
              </p>
            ) : (
              <PdfPageCanvas pdf={pdf} page={shown} label={label} />
            )
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- a signed Storage URL that expires; the optimizer would cache it
            <img src={fileUrl} alt={label} data-testid="document-page" className="block h-auto w-full" onError={() => setFailed(true)} />
          )}
        </div>
      </div>
    </div>
  );
}
