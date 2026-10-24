'use client';

import { Archive, ArchiveRestore } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { archiveProperty, restoreProperty } from '@/app/(app)/properties/actions';
import { FormAlert } from '@/components/form-alert';
import { useUndoToast } from '@/components/undo-toast';
import { UndoToastProvider } from '@/components/undo-toast-provider';
import { Button } from '@/components/ui/button';
import { useAction } from '@/components/use-action';
import { ARCHIVED_PARAM } from './property-form-values';

function useWrite() {
  const t = useTranslations('propertyForm');
  const { pending, run } = useAction();
  const [error, setError] = useState<string | null>(null);
  const write = (call: () => Promise<{ ok: boolean }>, then: () => void) => {
    setError(null);
    run(call, (result) => (result.ok ? then() : setError(t('errorNetwork'))), { ok: false });
  };
  return { pending, error, write };
}

/** Archiving is reversible, so it takes no dialog (DESIGN-BRIEF §4): the list it lands on offers `Hoàn tác`. */
export function ArchiveButton({ propertyId }: { propertyId: string }) {
  const t = useTranslations('propertyForm');
  const router = useRouter();
  const { pending, error, write } = useWrite();
  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        data-testid="archive-property"
        onClick={() => write(() => archiveProperty(propertyId), () => router.push(`/properties?${ARCHIVED_PARAM}=${propertyId}`))}
      >
        <Archive aria-hidden="true" />
        {t('archive')}
      </Button>
      <FormAlert message={error} />
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
export function ArchivedUndo({ propertyId, nickname }: { propertyId: string; nickname: string }) {
  return (
    <UndoToastProvider>
      <ArchivedToast propertyId={propertyId} nickname={nickname} />
    </UndoToastProvider>
  );
}

export function RestoreButton({ propertyId, label }: { propertyId: string; label: string }) {
  const router = useRouter();
  const { pending, error, write } = useWrite();
  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="outline" disabled={pending} data-testid="restore-property" onClick={() => write(() => restoreProperty(propertyId), () => router.refresh())}>
        <ArchiveRestore aria-hidden="true" />
        {label}
      </Button>
      <FormAlert message={error} />
    </div>
  );
}
