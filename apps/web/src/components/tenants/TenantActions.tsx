'use client';

import { lazy } from 'react';
import { DataExport, type DataExportLabels } from '@/components/settings/data-export';
import { Button } from '@/components/ui/button';
import { DeferredPopup, useDeferredDialog } from '@/components/use-deferred-dialog';
import type { EraseLabels } from './ErasePersonDialog';

const loadErase = () => import('./ErasePersonDialog');
const ErasePersonDialog = lazy(loadErase);

export type TenantActionLabels = {
  readonly export: DataExportLabels;
  readonly exportTitle: string;
  readonly exportIntro: string;
  readonly eraseTitle: string;
  readonly eraseIntro: string;
  readonly eraseStart: string;
  readonly erase: EraseLabels;
};

/** The two things an admin can do with one person's data: take a copy, and, once nothing is owed, erase who they are. */
export function TenantActions({ partyId, canErase, labels }: { partyId: string; canErase: boolean; labels: TenantActionLabels }) {
  const erase = useDeferredDialog(loadErase);
  return (
    <>
      <section aria-labelledby="tenant-export" className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5 shadow-xs sm:p-6">
        <h2 id="tenant-export" className="text-headline font-semibold text-text">
          {labels.exportTitle}
        </h2>
        <p className="text-body text-text-secondary">{labels.exportIntro}</p>
        <DataExport labels={labels.export} endpoint={`/api/export/party/${partyId}`} />
      </section>
      {canErase ? (
        <section aria-labelledby="tenant-erase" className="flex flex-col items-start gap-3 rounded-lg border border-border bg-surface p-5 shadow-xs sm:p-6">
          <h2 id="tenant-erase" className="text-headline font-semibold text-text">
            {labels.eraseTitle}
          </h2>
          <p className="text-body text-text-secondary">{labels.eraseIntro}</p>
          <Button type="button" variant="secondary" data-testid="erase-start" {...erase.triggerProps}>
            {labels.eraseStart}
          </Button>
          <DeferredPopup dialog={erase} popup={ErasePersonDialog} props={{ partyId, labels: labels.erase }} />
        </section>
      ) : null}
    </>
  );
}
