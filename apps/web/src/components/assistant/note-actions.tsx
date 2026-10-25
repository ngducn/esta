'use client';

import type { ProposalDecided } from '@esta/ops';
import { Check, EyeOff, FileText, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { lazy, useState } from 'react';
import { approveProposal, setNoteStatus } from '@/app/(app)/assistant/actions';
import { ReminderAction } from '@/components/collections/ReminderAction';
import { FormAlert } from '@/components/form-alert';
import { StatusShape } from '@/components/status-mark';
import { buttonVariants } from '@/components/ui/button-variants';
import { useAction } from '@/components/use-action';
import { DeferredPopup, useDeferredDialog } from '@/components/use-deferred-dialog';
import { useUndoableAction } from '@/components/use-undoable-action';
import { useHydrated } from '@/lib/use-hydrated';
import type { InboxStatus, NoteStatus } from '@/server/agent/items';
import type { ReminderLabels, ReminderTarget } from '@/server/reminders/board';

const loadConfirm = () => import('@/components/confirm-dialog-popup');
const ConfirmDialogPopup = lazy(loadConfirm);

export type NoteActionLabels = {
  readonly markRead: string;
  readonly markReadLabel: string;
  readonly dismiss: string;
  readonly dismissLabel: string;
  readonly dismissed: string;
  readonly failed: string;
  readonly restoreFailed: string;
};

const button = buttonVariants({ variant: 'outline' });

export function NoteActions({ id, status, labels }: { id: string; status: InboxStatus; labels: NoteActionLabels }) {
  const hydrated = useHydrated();
  const { pending, error, perform } = useUndoableAction({ failed: labels.failed, restoreFailed: labels.restoreFailed });
  const disabled = pending || !hydrated;
  const markRead = () => perform(() => setNoteStatus({ id, status: 'read' }));
  const dismiss = () => perform(() => setNoteStatus({ id, status: 'dismissed' }), { message: labels.dismissed, restore: () => setNoteStatus({ id, status }) });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {status === 'new' ? (
          <button type="button" onClick={markRead} disabled={disabled} aria-label={labels.markReadLabel} data-testid="note-read" className={button}>
            <Check aria-hidden="true" />
            {labels.markRead}
          </button>
        ) : null}
        <button type="button" onClick={dismiss} disabled={disabled} aria-label={labels.dismissLabel} data-testid="note-dismiss" className={button}>
          <EyeOff aria-hidden="true" />
          {labels.dismiss}
        </button>
      </div>
      <FormAlert message={error} />
    </div>
  );
}

export type ProposalActionLabels = {
  readonly approve: string;
  readonly approveLabel: string;
  readonly cancel: string;
  readonly skip: string;
  readonly skipLabel: string;
  readonly skipped: string;
  readonly approved: string;
  readonly notApplicable: string;
  readonly failed: string;
  readonly restoreFailed: string;
};

/** What Esta adds to a proposal card from the records, never from the model's text. */
export type ProposalExtras = {
  /** Asked before a rent change or a renewal runs; such a proposal without it cannot be approved. */
  readonly confirm: string | null;
  readonly needsConfirm: boolean;
  /** The bill's reminder, which an approved `draft_reminder` opens. */
  readonly reminder: { readonly label: string; readonly title: string; readonly target: ReminderTarget; readonly labels: ReminderLabels } | null;
  /** The lease an approved rent change or renewal wrote. */
  readonly lease: { readonly href: string; readonly label: string } | null;
};

/** What an approval decided, as the card says it, with the lease or the reminder it leads to. */
export function ProposalDecision({
  decision,
  labels,
  extras,
  openReminder = false,
}: {
  decision: ProposalDecided['status'];
  labels: Pick<ProposalActionLabels, 'approved' | 'notApplicable'>;
  extras: ProposalExtras;
  openReminder?: boolean;
}) {
  const approved = decision === 'approved';
  return (
    <div className="flex flex-col gap-3">
      <p role="status" data-testid="proposal-decision" data-decision={decision} className="flex items-center gap-2 text-body font-medium text-ink">
        <StatusShape status={approved ? 'paid' : 'ended'} className="size-4" />
        {approved ? labels.approved : labels.notApplicable}
      </p>
      {approved && (extras.lease !== null || extras.reminder !== null) ? (
        <div className="flex flex-wrap gap-2">
          {extras.lease === null ? null : (
            <Link href={extras.lease.href} data-testid="proposal-lease" className={button}>
              <FileText aria-hidden="true" />
              {extras.lease.label}
            </Link>
          )}
          {extras.reminder === null ? null : <ReminderAction {...extras.reminder} initialOpen={openReminder} />}
        </div>
      ) : null}
    </div>
  );
}

const isDecided = (status: NoteStatus): status is ProposalDecided['status'] => status === 'approved' || status === 'failed';

/**
 * `Đồng ý` runs the approval once, after Esta's question for a type that changes a lease; `Bỏ qua` dismisses with undo.
 * A second tap or a stale tab reads what was decided. The card stays this one component once decided, so the refresh
 * after an approval keeps the reminder sheet it opened.
 */
export function ProposalActions({ id, status, labels, extras }: { id: string; status: NoteStatus; labels: ProposalActionLabels; extras: ProposalExtras }) {
  const hydrated = useHydrated();
  const router = useRouter();
  const confirm = useDeferredDialog(loadConfirm);
  const { pending: approving, run } = useAction();
  const { pending: skipping, error, perform } = useUndoableAction({ failed: labels.failed, restoreFailed: labels.restoreFailed });
  const [decision, setDecision] = useState<ProposalDecided['status'] | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);
  const disabled = approving || skipping || !hydrated;

  const approve = () => {
    setApproveError(null);
    run(
      () => approveProposal({ id }),
      (result) => {
        if (!result.ok) return setApproveError(labels.failed);
        setDecision(result.value);
        router.refresh();
      },
    );
  };
  const skip = (from: InboxStatus) => perform(() => setNoteStatus({ id, status: 'dismissed' }), { message: labels.skipped, restore: () => setNoteStatus({ id, status: from }) });

  if (decision !== null) return <ProposalDecision decision={decision} labels={labels} extras={extras} openReminder />;
  if (isDecided(status)) return <ProposalDecision decision={status} labels={labels} extras={extras} />;
  const approveProps = extras.needsConfirm ? confirm.triggerProps : { onClick: approve };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {extras.needsConfirm && extras.confirm === null ? null : (
          <button type="button" {...approveProps} disabled={disabled} aria-label={labels.approveLabel} data-testid="proposal-approve" className={buttonVariants({ variant: 'primary' })}>
            <Check aria-hidden="true" />
            {labels.approve}
          </button>
        )}
        <button type="button" onClick={() => skip(status)} disabled={disabled} aria-label={labels.skipLabel} data-testid="proposal-skip" className={button}>
          <X aria-hidden="true" />
          {labels.skip}
        </button>
      </div>
      {extras.confirm === null ? null : (
        <DeferredPopup dialog={confirm} popup={ConfirmDialogPopup} props={{ title: extras.confirm, confirmLabel: labels.approve, cancelLabel: labels.cancel, onConfirm: approve }} />
      )}
      <FormAlert message={approveError ?? error} />
    </div>
  );
}
