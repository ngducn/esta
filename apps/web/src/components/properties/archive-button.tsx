'use client';

import { Archive, ArchiveRestore } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { archiveProperty, restoreProperty } from '@/app/(app)/properties/actions';
import { StatusShape } from '@/components/status-mark';
import { UndoToastProvider, useUndoToast } from '@/components/undo-toast';
import { Button } from '@/components/ui/button';
import { ARCHIVED_PARAM } from './property-form-values';

function useWrite() {
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  const run = (write: () => Promise<{ ok: boolean }>, then: () => void) =>
    startTransition(async () => {
      setFailed(false);
      const result = await write().catch(() => ({ ok: false }));
      if (result.ok) then();
      else setFailed(true);
    });
  return { pending, failed, run };
}

function WriteError({ failed }: { failed: boolean }) {
  const t = useTranslations('propertyForm');
  return (
    <p role="status" aria-live="polite" className="flex min-h-7 items-start gap-2 text-body">
      {failed ? (
        <>
          <StatusShape status="overdue" className="mt-1 size-4" />
          <span className="text-overdue">{t('errorNetwork')}</span>
        </>
      ) : null}
    </p>
  );
}

/** Archiving is reversible, so it takes no dialog (DESIGN-BRIEF §4): the list it lands on offers `Hoàn tác`. */
export function ArchiveButton({ propertyId }: { propertyId: string }) {
  const t = useTranslations('propertyForm');
  const router = useRouter();
  const { pending, failed, run } = useWrite();
  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        data-testid="archive-property"
        onClick={() => run(() => archiveProperty(propertyId), () => router.push(`/properties?${ARCHIVED_PARAM}=${propertyId}`))}
      >
        <Archive aria-hidden="true" />
        {t('archive')}
      </Button>
      <WriteError failed={failed} />
    </div>
  );
}

function ArchivedToast({ propertyId, nickname }: { propertyId: string; nickname: string }) {
  const t = useTranslations('properties');
  const router = useRouter();
  const showUndo = useUndoToast();
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete(ARCHIVED_PARAM);
    window.history.replaceState(window.history.state, '', url);
    showUndo(t('archivedToast', { nickname }), () => {
      void restoreProperty(propertyId).then((result) => {
        if (result.ok) router.refresh();
      });
    });
  }, [propertyId, nickname, router, showUndo, t]);
  return null;
}

/** Shown on `Tài sản` right after an archive, so the undo sits beside the list the card left. */
export function ArchivedNotice({ propertyId, nickname }: { propertyId: string; nickname: string }) {
  return (
    <UndoToastProvider>
      <ArchivedToast propertyId={propertyId} nickname={nickname} />
    </UndoToastProvider>
  );
}

export function RestoreButton({ propertyId, label }: { propertyId: string; label: string }) {
  const router = useRouter();
  const { pending, failed, run } = useWrite();
  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="outline" disabled={pending} data-testid="restore-property" onClick={() => run(() => restoreProperty(propertyId), () => router.refresh())}>
        <ArchiveRestore aria-hidden="true" />
        {label}
      </Button>
      <WriteError failed={failed} />
    </div>
  );
}
