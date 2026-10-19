'use client';

import { ChevronLeft, Download, PencilLine } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { lazy, Suspense, useState, useTransition } from 'react';
import { DocumentPager } from '@/components/extraction/document-pager';
import { Button } from '@/components/ui/button';
import { useNoticeToast, useUndoToast } from '@/components/undo-toast';
import { useHydrated } from '@/lib/use-hydrated';
import { cn } from '@/lib/utils';
import { downloadDocument, updateDocument, type DocumentEdit } from '@/server/documents/actions';
import type { DocumentPageData } from '@/server/documents/detail';
import { ExtractionPill } from './document-tile';
import { useDocumentStatuses } from './use-document-status';

const EditSheet = lazy(() => import('./document-edit-sheet'));

/**
 * One document: its pages through a signed URL, `Tải xuống` logged as a download, the review status with its link,
 * and `Sửa thông tin` with an undo toast (DOC-4).
 */
export function DocumentPage({ data }: { data: DocumentPageData }) {
  const t = useTranslations('documents');
  const router = useRouter();
  const hydrated = useHydrated();
  const showUndo = useUndoToast();
  const notice = useNoticeToast();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(false);
  const [downloadFailed, setDownloadFailed] = useState(false);
  const [downloading, startDownload] = useTransition();
  const { document } = data;
  const extraction = useDocumentStatuses(document.id, data.statuses, { by: 'document' });

  const download = () =>
    startDownload(async () => {
      const url = await downloadDocument(document.id).catch(() => null);
      setDownloadFailed(url === null);
      if (url !== null) window.location.assign(url);
    });

  const saved = (title: string, previous: DocumentEdit) => {
    setEditing(false);
    router.refresh();
    showUndo(t('updated', { title }), () => {
      void updateDocument(previous)
        .catch(() => ({ ok: false }) as const)
        .then((result) => {
          if (!result.ok) notice(t('undoFailed'));
          router.refresh();
        });
    });
  };

  const meta = [document.categoryLabel, document.propertyName ?? t('noProperty'), t('pages', { count: document.pageCount })];

  return (
    <div data-testid="document-detail" className="flex flex-col gap-5">
      <Link href="/documents" className="-ml-2 flex min-h-touch w-fit items-center gap-1 rounded-sm px-2 text-body font-semibold text-ink-2 hover:text-ink">
        <ChevronLeft className="size-5 shrink-0" strokeWidth={2} aria-hidden="true" />
        {t('back')}
      </Link>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <header className="flex flex-col gap-3 lg:order-2 lg:rounded-lg lg:border lg:border-rule lg:bg-surface lg:p-5 lg:shadow-card">
          <h1 className="text-h2 break-words text-balance lg:text-h3">{document.title}</h1>
          <p data-testid="document-meta" className="text-body break-words text-ink-2">
            {meta.join(' · ')}
          </p>
          {document.expiryText === null ? null : (
            <p data-testid="document-expiry" className={cn('text-body font-semibold', document.expiringSoon ? 'text-due' : 'text-ink-2')}>
              {document.expiryText}
            </p>
          )}
          {document.tags.length === 0 ? null : <p className="text-small break-words text-ink-muted">{t('tags', { tags: document.tags.join(', ') })}</p>}
          <ExtractionPill documentId={document.id} status={extraction.statuses[document.id] ?? 'none'} workerOffline={extraction.workerOffline} showAccepted />
          <div className="flex flex-wrap gap-2 pt-1">
            <Button type="button" data-testid="download-document" disabled={!hydrated || downloading} onClick={download}>
              <Download aria-hidden="true" />
              {t('download')}
            </Button>
            {data.canEdit ? (
              <Button type="button" variant="outline" data-testid="edit-document" disabled={!hydrated} onClick={() => setEditing(true)}>
                <PencilLine aria-hidden="true" />
                {t('edit')}
              </Button>
            ) : null}
          </div>
          {downloadFailed ? (
            <p role="alert" className="text-body font-semibold text-overdue">
              {t('downloadFailed')}
            </p>
          ) : null}
        </header>
        <div className="lg:order-1">
          <DocumentPager
            documentId={document.id}
            fileUrl={data.fileUrl}
            reviewUrl={data.reviewUrl}
            thumbUrl={data.thumbUrl}
            mime={document.mime}
            pageCount={document.pageCount}
            title={document.title}
            page={page}
            onPage={setPage}
          />
        </div>
      </div>
      {editing ? (
        <Suspense fallback={null}>
          <EditSheet document={document} properties={data.properties} onClose={() => setEditing(false)} onSaved={saved} />
        </Suspense>
      ) : null}
    </div>
  );
}
