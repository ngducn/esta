'use client';

import { FilePlus2, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { lazy, Suspense, useState, type DragEvent } from 'react';
import { Button } from '@/components/ui/button';
import { useNoticeToast, useUndoToast } from '@/components/undo-toast';
import { useHydrated } from '@/lib/use-hydrated';
import { cn } from '@/lib/utils';
import { archiveDocument } from '@/server/documents/actions';
import { DocumentTile, type DocumentTileData } from './document-tile';

const UploadSheet = lazy(() => import('./upload-sheet'));

type Opened = { readonly file: File | null } | null;

/**
 * The property's documents, one column on a phone and three on a wide screen, with `Thêm tài liệu` and, on a wide
 * screen, a drop zone that opens the same sheet. Viewers get neither.
 */
export function DocumentGrid({
  propertyId,
  nickname,
  documents,
  canEdit,
}: {
  propertyId: string;
  nickname: string;
  documents: readonly DocumentTileData[];
  canEdit: boolean;
}) {
  const t = useTranslations('documents');
  const router = useRouter();
  const hydrated = useHydrated();
  const showUndo = useUndoToast();
  const notice = useNoticeToast();
  const [opened, setOpened] = useState<Opened>(null);
  const [dragging, setDragging] = useState(false);

  const drop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file !== undefined) setOpened({ file });
  };

  const saved = ({ documentId, title }: { documentId: string; title: string }) => {
    setOpened(null);
    router.refresh();
    showUndo(t('saved', { title }), () => {
      void archiveDocument(documentId)
        .catch(() => false)
        .then((ok) => {
          if (!ok) notice(t('undoFailed'));
          router.refresh();
        });
    });
  };

  return (
    <section aria-labelledby="documents-title" data-testid="documents" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="documents-title" className="text-h3 text-ink">
          {t('tabTitle')}
        </h2>
        {canEdit ? (
          <Button id="upload" data-testid="add-document" disabled={!hydrated} onClick={() => setOpened({ file: null })}>
            <FilePlus2 aria-hidden="true" />
            {t('add')}
          </Button>
        ) : null}
      </div>
      {canEdit ? (
        <div
          data-testid="drop-zone"
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={drop}
          className={cn(
            'hidden min-h-24 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed p-4 text-center lg:flex',
            dragging ? 'border-accent bg-accent/5' : 'border-rule-strong',
          )}
        >
          <Upload className="size-6 text-ink-muted" aria-hidden="true" />
          <p className="text-body font-semibold text-ink">{t('dropZone')}</p>
          <p className="text-small text-ink-muted">{t('fileRule')}</p>
        </div>
      ) : null}
      {documents.length === 0 ? (
        <p data-testid="documents-empty" className="rounded-lg border border-rule bg-surface p-5 text-body text-ink-2 shadow-card">
          {t('empty')}
        </p>
      ) : (
        <ul aria-label={t('gridLabel', { nickname })} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {documents.map((document) => (
            <DocumentTile key={document.id} document={document} />
          ))}
        </ul>
      )}
      {opened === null ? null : (
        <Suspense fallback={null}>
          <UploadSheet propertyId={propertyId} nickname={nickname} initialFile={opened.file} onClose={() => setOpened(null)} onSaved={saved} />
        </Suspense>
      )}
    </section>
  );
}
