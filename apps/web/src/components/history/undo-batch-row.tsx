'use client';

import { useTranslations } from 'next-intl';
import { startTransition, useActionState, type ReactNode } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { StatusShape } from '@/components/status-shape';
import { undoBatch } from '@/server/actions/batches';

export function UndoBatchRow({ batchId, summary, body, children }: { batchId: string; summary: string; body: string; children: ReactNode }) {
  const t = useTranslations('history');
  const [state, undo, pending] = useActionState(undoBatch, null);
  return (
    <>
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex min-w-0 flex-1 basis-60 flex-col gap-1">{children}</div>
        <ConfirmDialog
          title={t('undoTitle', { summary })}
          description={body}
          triggerLabel={t('undo')}
          confirmLabel={t('undo')}
          onConfirm={() => startTransition(() => undo(batchId))}
        />
      </div>
      <div role="status" aria-live="polite" data-testid="undo-status" className="text-body">
        {pending ? <p className="text-ink-muted">{t('undoing')}</p> : null}
        {!pending && state !== null && state.status !== 'undone' ? (
          <div className="flex items-start gap-2">
            <StatusShape status="overdue" className="mt-1 size-4 shrink-0" />
            {state.status === 'failed' || state.status === 'already_undone' ? (
              <p className="text-overdue">{t(state.status === 'failed' ? 'failed' : 'alreadyUndone')}</p>
            ) : (
              <div className="flex max-w-prose flex-col gap-1">
                <p className="font-medium text-overdue">{t('refused')}</p>
                <ul className="flex flex-col gap-1 text-ink-2">
                  {state.blockers.map(({ reason, flow }) => (
                    <li key={reason}>
                      {t('reason', { reason })} {t('flow', { flow })}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </>
  );
}
