'use client';

import { FilePlus2, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { lazy, Suspense, useState, type DragEvent, type ReactNode } from 'react';
import { StatusShape, statusMarks } from '@/components/status-mark';
import { Button, buttonVariants } from '@/components/ui/button';
import { useNoticeToast, useUndoToast } from '@/components/undo-toast';
import { useHydrated } from '@/lib/use-hydrated';
import { cn } from '@/lib/utils';
import { archiveDocument } from '@/server/documents/actions';
import type { DocumentStatuses } from '@/server/documents/extraction-status';
import type { VaultTile } from '@/server/documents/list';
import { DocumentTile } from './document-tile';
import { useDocumentStatuses } from './use-document-status';
import { VaultGroups } from './vault-groups';
import type { SearchState } from '@/server/documents/vault';
import { VaultSearch } from './vault-search';

const UploadSheet = lazy(() => import('./upload-sheet'));

/** The household's vault on Tài liệu, or one property's on its Tài liệu tab, where documents are added. */
export type VaultScope =
  | { readonly kind: 'household'; readonly householdId: string }
  | { readonly kind: 'property'; readonly propertyId: string; readonly nickname: string };

export type ExpiringItem = { readonly id: string; readonly title: string; readonly propertyName: string | null; readonly text: string };

type Opened = { readonly file: File | null } | null;

function ExpiringSoon({ items }: { items: readonly ExpiringItem[] }) {
  const t = useTranslations('documents');
  return (
    <section aria-labelledby="expiring-title" data-testid="expiring-soon" className="flex flex-col gap-2 rounded-lg border border-rule bg-surface p-4 shadow-card sm:p-5">
      <h2 id="expiring-title" className="text-lead font-bold text-ink">
        {t('expiringTitle')}
      </h2>
      {items.length === 0 ? (
        <p className="text-body text-ink-2">{t('expiringNone')}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-rule">
          {items.map((item) => (
            <li key={item.id} data-testid="expiring-item" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 first:pt-0 last:pb-0">
              <div className="flex min-w-0 flex-col">
                <Link href={`/documents/${item.id}`} prefetch={false} className="text-body font-semibold break-words text-ink underline-offset-4 hover:underline">
                  {item.title}
                </Link>
                {item.propertyName === null ? null : <span className="text-small break-words text-ink-muted">{item.propertyName}</span>}
              </div>
              <span data-testid="expiring-days" className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-small font-semibold', statusMarks.due.pill)}>
                <StatusShape status="due" className="size-4" />
                {item.text}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SearchResults({ state, render }: { state: SearchState; render: (tile: VaultTile) => ReactNode }) {
  const t = useTranslations('documents');
  switch (state.step) {
    case 'idle':
      return null;
    case 'searching':
      return (
        <p role="status" data-testid="search-status" className="text-body text-ink-muted">
          {t('searching')}
        </p>
      );
    case 'failed':
      return (
        <p role="alert" data-testid="search-error" className="rounded-lg border border-rule bg-surface p-4 text-body font-semibold text-overdue shadow-card">
          {t('loadFailed')}
        </p>
      );
    case 'done':
      return state.tiles.length === 0 ? (
        <p role="status" data-testid="search-empty" className="rounded-lg border border-rule bg-surface p-4 text-body break-words text-ink-2 shadow-card">
          {t('noMatch', { query: state.query })}
        </p>
      ) : (
        <section aria-labelledby="results-title" data-testid="vault-results" className="flex flex-col gap-3">
          <h2 id="results-title" aria-live="polite" className="text-lead font-bold text-ink">
            {t('results', { count: state.tiles.length })}
          </h2>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{state.tiles.map(render)}</ul>
          {state.capped ? <p className="text-small text-ink-muted">{t('capped', { count: state.tiles.length })}</p> : null}
        </section>
      );
  }
}

/**
 * DESIGN-BRIEF §6.10: search first, then what expires soon, then every document by property or by kind. A sensitive
 * tile stays blurred until `Xem` (DOC-5). On a property's tab the same vault adds `Thêm tài liệu` and the drop zone.
 */
export function DocumentVault({
  scope,
  tiles,
  expiring,
  search,
  canEdit,
  statuses,
}: {
  scope: VaultScope;
  tiles: readonly VaultTile[];
  expiring: readonly ExpiringItem[];
  search: SearchState;
  canEdit: boolean;
  statuses: DocumentStatuses;
}) {
  const t = useTranslations('documents');
  const router = useRouter();
  const hydrated = useHydrated();
  const showUndo = useUndoToast();
  const notice = useNoticeToast();
  const [opened, setOpened] = useState<Opened>(null);
  const [dragging, setDragging] = useState(false);
  const extraction = useDocumentStatuses(scope.kind === 'property' ? scope.propertyId : scope.householdId, statuses, { by: scope.kind });
  const propertyId = scope.kind === 'property' ? scope.propertyId : null;
  const uploads = scope.kind === 'property' && canEdit;

  const tile = (document: VaultTile, showProperty: boolean) => (
    <DocumentTile
      key={document.id}
      document={document}
      extraction={extraction.statuses[document.id] ?? 'none'}
      workerOffline={extraction.workerOffline}
      showProperty={showProperty}
    />
  );

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
    <section aria-labelledby={scope.kind === 'property' ? 'documents-title' : undefined} data-testid="documents" className="flex flex-col gap-5">
      {scope.kind === 'property' ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="documents-title" className="text-h3 text-ink">
            {t('tabTitle')}
          </h2>
          {uploads ? (
            <Button id="upload" data-testid="add-document" disabled={!hydrated} onClick={() => setOpened({ file: null })}>
              <FilePlus2 aria-hidden="true" />
              {t('add')}
            </Button>
          ) : null}
        </div>
      ) : null}
      {uploads ? (
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
      {tiles.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-rule bg-surface p-5 shadow-card">
          <p data-testid="documents-empty" className="text-body text-ink-2">
            {t('empty')}
          </p>
          {scope.kind === 'household' && canEdit ? (
            <Link href="/properties" data-testid="add-document" className={buttonVariants({ variant: 'primary' })}>
              <FilePlus2 aria-hidden="true" />
              {t('add')}
            </Link>
          ) : null}
        </div>
      ) : (
        <>
          <VaultSearch initial={search} propertyId={propertyId}>
            {(state) => <SearchResults state={state} render={(document) => tile(document, scope.kind === 'household')} />}
          </VaultSearch>
          <ExpiringSoon items={expiring} />
          <VaultGroups
            tiles={tiles}
            initialBy={scope.kind === 'property' ? 'category' : 'property'}
            renderTile={(document, showProperty) => tile(document, showProperty && scope.kind === 'household')}
          />
        </>
      )}
      {opened === null || scope.kind !== 'property' ? null : (
        <Suspense fallback={null}>
          <UploadSheet propertyId={scope.propertyId} nickname={scope.nickname} initialFile={opened.file} onClose={() => setOpened(null)} onSaved={saved} />
        </Suspense>
      )}
    </section>
  );
}
