'use client';

import { ZoomIn, ZoomOut } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { openDocument } from '@/server/documents/actions';

const ZOOMS = [1, 1.5, 2, 3] as const;
/** Rendered once at this width and scaled by CSS, so zooming never re-renders a page. */
const RENDER_WIDTH = 1600;
const LAYER = 'absolute inset-0 size-full object-contain';

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
  return <canvas ref={canvas} role="img" aria-label={label} data-testid="document-page" data-drawn={drawn} className={LAYER} />;
}

/** The server-rendered image may finish before hydration, when React fires no `load`, so `complete` is read on mount. */
function PageImage({ src, label, onError }: { src: string; label: string; onError: () => void }) {
  const [drawn, setDrawn] = useState(false);
  const mounted = useCallback((image: HTMLImageElement | null) => {
    if (image?.complete === true && image.naturalWidth > 0) setDrawn(true);
  }, []);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a signed Storage URL that expires; the optimizer would cache it
    <img ref={mounted} src={src} alt={label} data-testid="document-page" data-drawn={drawn} fetchPriority="high" className={LAYER} onLoad={() => setDrawn(true)} onError={onError} />
  );
}

/**
 * The document beside its fields: page tabs, zoom, and the page a field was read from. Page 1 opens from its review
 * copy. The full-size file loads only once Mẹ zooms in or turns the page, or at once for a document uploaded before
 * review copies existed: a photo layered over its copy, a PDF's pages drawn by pdf.js. Pages sit in a sheet-shaped
 * box, so nothing below moves when one loads.
 */
export function DocumentPager({
  documentId,
  fileUrl: renderedUrl,
  reviewUrl: renderedReview,
  thumbUrl,
  mime,
  pageCount,
  title,
  page,
  onPage,
}: {
  documentId: string;
  fileUrl: string | null;
  /** Page 1 at review size, about a fifth of a phone photo's bytes; null for an older upload. */
  reviewUrl: string | null;
  /** The upload's 320 px first-page thumbnail, shown under an older PDF's page 1 while pdf.js loads and draws it. */
  thumbUrl: string | null;
  mime: string;
  pageCount: number;
  title: string;
  page: number;
  onPage: (page: number) => void;
}) {
  const t = useTranslations('extraction');
  // Each server render signs new URLs; the first ones stay, so a refresh never reloads the pages already drawn.
  const [fileUrl, setFileUrl] = useState(renderedUrl);
  const [reviewUrl] = useState(renderedReview);
  const [zoom, setZoom] = useState(0);
  const [pdf, setPdf] = useState<PdfDocument | null>(null);
  const [failed, setFailed] = useState(fileUrl === null);
  const resigned = useRef(false);
  const isPdf = mime === 'application/pdf';
  const pages = pdf?.numPages ?? (isPdf ? pageCount : 1);
  const shown = Math.min(Math.max(page, 1), pages);
  const label = t('documentAlt', { title, page: shown });

  const wantsOriginal = reviewUrl === null || zoom > 0 || shown > 1;
  const [original, setOriginal] = useState(wantsOriginal);
  if (wantsOriginal && !original) setOriginal(true);

  // The file's URL lives `ESTA_SIGNED_URL_TTL_SECONDS`, so a zoom minutes after opening signs it again, once.
  const resign = useCallback(async () => {
    if (resigned.current) return false;
    resigned.current = true;
    const url = await openDocument(documentId).catch(() => null);
    if (url !== null) setFileUrl(url);
    return url !== null;
  }, [documentId]);

  useEffect(() => {
    if (!isPdf || !original || fileUrl === null) return;
    let task: PdfTask | null = null;
    let live = true;
    openPdf(fileUrl)
      .then((opened) => {
        task = opened;
        return opened.promise;
      })
      .then(
        (loaded) => live && setPdf(loaded),
        async () => {
          if (live && !(await resign()) && live) setFailed(true);
        },
      );
    return () => {
      live = false;
      void task?.destroy();
    };
  }, [fileUrl, isPdf, original, resign]);

  const backdrop = shown === 1 ? (reviewUrl ?? thumbUrl) : null;

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
        <div className="relative aspect-[5/7]" style={{ width: `${(ZOOMS[zoom] ?? 1) * 100}%` }}>
          {failed || fileUrl === null ? (
            <p role="alert" className="p-4 text-body text-overdue">
              {t('documentUnavailable')}
            </p>
          ) : isPdf && pdf === null && shown === 1 && reviewUrl !== null ? (
            <PageImage src={reviewUrl} label={label} onError={() => setFailed(true)} />
          ) : isPdf ? (
            <>
              {backdrop !== null ? (
                // eslint-disable-next-line @next/next/no-img-element -- a signed Storage URL that expires; the optimizer would cache it
                <img src={backdrop} alt="" className={LAYER} />
              ) : null}
              {pdf === null ? (
                <p role="status" className="relative p-4 text-body text-ink-muted">
                  {t('pageLoading', { page: shown })}
                </p>
              ) : (
                <PdfPageCanvas pdf={pdf} page={shown} label={label} />
              )}
            </>
          ) : (
            <>
              <PageImage src={reviewUrl ?? fileUrl} label={label} onError={() => setFailed(true)} />
              {reviewUrl !== null && original ? (
                // eslint-disable-next-line @next/next/no-img-element -- a signed Storage URL that expires; the optimizer would cache it
                <img src={fileUrl} alt="" className={LAYER} onError={() => void resign()} />
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
