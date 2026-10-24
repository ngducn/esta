'use client';

import { MAX_DOCUMENT_BYTES } from '@esta/core/documents';
import { Camera, ChevronLeft, Images } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { FormActions } from '@/components/form-actions';
import { Button } from '@/components/ui/button';
import { buildPdfFromImages } from '@/lib/capture/build-pdf';
import { downscaleForPdf } from '@/lib/capture/downscale';
import { MAX_CAPTURE_PAGES, useCapturePages, type CaptureAction } from '@/lib/capture/pages';
import { cn } from '@/lib/utils';

export type CombinedCapture = { readonly pdf: File; readonly firstPage: Blob; readonly pageCount: number };

type Problem = 'photoUnreadable' | 'combineFailed' | 'combinedTooLarge';
type Move = Extract<CaptureAction, { url: string }>['type'];

const PHOTO_TYPES = 'image/jpeg,image/png,image/webp';
const pickerClass =
  'relative inline-flex min-h-touch cursor-pointer items-center justify-center gap-2 rounded-sm px-4 text-body font-medium has-[:disabled]:cursor-not-allowed has-[:disabled]:bg-rule has-[:disabled]:text-ink-muted has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus';

/**
 * Asks inside the sheet, as the duplicate warning does, so the sheet's focus trap never holds the answer out of reach.
 * The photos exist only in this tab until the PDF is saved, so leaving names how many would be lost.
 */
export function LeaveConfirm({ count, onKeep, onDiscard }: { count: number; onKeep: () => void; onDiscard: () => void }) {
  const t = useTranslations('documents');
  const id = useId();
  const keep = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    keep.current?.focus();
  }, []);
  return (
    <div
      role="alertdialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-body`}
      data-testid="leave-confirm"
      className="flex flex-col gap-3 rounded-md border border-due bg-due-fill p-4"
    >
      <h3 id={`${id}-title`} className="text-body font-semibold text-ink">
        {t('leaveTitle', { count })}
      </h3>
      <p id={`${id}-body`} className="text-body text-ink-2">
        {t('leaveBody')}
      </p>
      <FormActions>
        <Button ref={keep} type="button" variant="outline" data-testid="keep-pages" onClick={onKeep}>
          {t('keepPages')}
        </Button>
        <Button type="button" variant="primary" data-testid="discard-pages" onClick={onDiscard}>
          {t('discardPages', { count })}
        </Button>
      </FormActions>
    </div>
  );
}

/**
 * Several photos become one PDF before anything is uploaded (DOC-2). Each photo is turned upright and downscaled as it
 * arrives, one at a time so a phone never holds two 12 MP bitmaps, and the strip orders pages with text buttons only.
 */
export function MultiPageCapture({
  confirming,
  onCount,
  onBack,
  onCombined,
}: {
  /** The leave confirm is open, so it takes the footer's place. */
  confirming: boolean;
  onCount: (count: number) => void;
  onBack: () => void;
  onCombined: (capture: CombinedCapture) => void;
}) {
  const t = useTranslations('documents');
  const { pages, add, dispatch } = useCapturePages();
  const [pending, setPending] = useState(0);
  const [combining, setCombining] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const queue = useRef(Promise.resolve());
  const live = useRef(true);
  const strip = useRef<HTMLOListElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const focusAfter = useRef<{ readonly url: string | null; readonly action: Move } | null>(null);
  const full = pages.length + pending >= MAX_CAPTURE_PAGES;

  useEffect(() => {
    live.current = true;
    // Fetched while Mẹ photographs, so a connection lost before Gộp thành PDF no longer matters.
    void import('pdf-lib').catch(() => undefined);
    return () => {
      live.current = false;
    };
  }, []);

  useEffect(() => {
    onCount(pages.length);
  }, [pages.length, onCount]);

  useLayoutEffect(() => {
    const target = focusAfter.current;
    focusAfter.current = null;
    if (target === null) return;
    const button = target.url === null ? null : strip.current?.querySelector<HTMLElement>(`[data-url="${CSS.escape(target.url)}"] [data-action="${target.action}"]`);
    (button ?? camera.current)?.focus();
  }, [pages]);

  const choose = (input: HTMLInputElement) => {
    const files = [...(input.files ?? [])].slice(0, Math.max(0, MAX_CAPTURE_PAGES - pages.length - pending));
    input.value = '';
    if (files.length === 0) return;
    setProblem(null);
    setPending((count) => count + files.length);
    queue.current = queue.current.then(async () => {
      for (const file of files) {
        if (!live.current) return;
        const image = await downscaleForPdf(file).catch(() => null);
        if (!live.current) return;
        if (image === null) setProblem('photoUnreadable');
        else add([image]);
        setPending((count) => count - 1);
      }
    });
  };

  const move = (url: string, action: Move) => {
    if (action === 'remove') {
      const at = pages.findIndex((page) => page.url === url);
      const next = pages[at + 1] ?? pages[at - 1];
      focusAfter.current = { url: next?.url ?? null, action: 'remove' };
    } else {
      focusAfter.current = { url, action };
    }
    dispatch({ type: action, url });
  };

  const combine = async () => {
    const [first] = pages;
    if (first === undefined) return;
    setProblem(null);
    setCombining(true);
    try {
      const pdf = await buildPdfFromImages(pages);
      if (!live.current) return;
      if (pdf.size > MAX_DOCUMENT_BYTES) {
        setProblem('combinedTooLarge');
        return;
      }
      const file = new File([pdf], t('captureFilename', { count: pages.length }), { type: 'application/pdf' });
      onCombined({ pdf: file, firstPage: first.blob, pageCount: pages.length });
    } catch {
      if (live.current) setProblem('combineFailed');
    } finally {
      if (live.current) setCombining(false);
    }
  };

  const busy = pending > 0 || combining;
  return (
    <div data-testid="multi-page-capture" className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className={cn(pickerClass, 'bg-ink text-surface')}>
            <Camera className="size-5 shrink-0" aria-hidden="true" />
            {t('nextPage')}
            <input
              ref={camera}
              type="file"
              accept="image/*"
              capture="environment"
              data-testid="capture-camera-input"
              disabled={full || combining}
              className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
              onChange={(event) => choose(event.target)}
            />
          </label>
          <label className={cn(pickerClass, 'border border-rule-strong bg-surface text-ink')}>
            <Images className="size-5 shrink-0" aria-hidden="true" />
            {t('chooseImages')}
            <input
              type="file"
              accept={PHOTO_TYPES}
              multiple
              data-testid="capture-files-input"
              disabled={full || combining}
              className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
              onChange={(event) => choose(event.target)}
            />
          </label>
        </div>
        <p role="status" data-testid="capture-status" className={cn('text-small', full ? 'font-medium text-ink' : 'text-ink-muted')}>
          {full ? t('pageLimit') : pending > 0 ? t('processingPhoto') : t('pagesCaptured', { count: pages.length })}
        </p>
      </div>
      {pages.length === 0 ? null : (
        <ol ref={strip} aria-label={t('stripLabel')} className="flex flex-col gap-2">
          {pages.map((page, index) => {
            const label = t('pageNumber', { number: index + 1 });
            return (
              <li key={page.url} data-url={page.url} data-testid="capture-page" className="flex items-center gap-3 rounded-md border border-rule bg-surface-2 p-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- a local blob URL of a photo taken in this tab */}
                <img src={page.url} alt={t('pageAlt', { number: index + 1 })} className="h-20 w-16 shrink-0 rounded-xs border border-rule bg-surface object-contain" />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <p data-testid="capture-page-number" className="text-body font-medium text-ink">
                    {label}
                  </p>
                  <div role="group" aria-label={label} className="flex flex-wrap gap-2">
                    {(['moveUp', 'moveDown', 'remove'] as const).map((action) => (
                      <Button
                        key={action}
                        type="button"
                        variant="outline"
                        data-action={action}
                        disabled={combining || (action === 'moveUp' && index === 0) || (action === 'moveDown' && index === pages.length - 1)}
                        focusableWhenDisabled
                        className="px-3"
                        onClick={() => move(page.url, action)}
                      >
                        {t(action)}
                      </Button>
                    ))}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {problem === null ? null : (
        <p role="alert" data-testid="capture-error" className="text-body font-medium text-overdue">
          {t(problem)}
        </p>
      )}
      {combining ? (
        <p role="status" className="text-body text-ink-2">
          {t('combining', { count: pages.length })}
        </p>
      ) : null}
      {confirming ? null : (
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <Button type="button" variant="outline" data-testid="capture-back" disabled={combining} onClick={onBack}>
            <ChevronLeft aria-hidden="true" />
            {t('captureBack')}
          </Button>
          <Button type="button" data-testid="combine-pages" disabled={pages.length === 0 || busy} onClick={() => void combine()}>
            {t('combine')}
          </Button>
        </div>
      )}
    </div>
  );
}
