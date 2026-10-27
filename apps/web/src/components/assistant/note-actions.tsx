'use client';

import type { ProposalDecided } from '@esta/ops';
import { Check, EyeOff, FileText, RotateCw, Undo2, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { lazy, useState } from 'react';
import { approveProposal, retryJob, setNoteStatus } from '@/app/(app)/assistant/actions';
import { ReminderAction } from '@/components/collections/ReminderAction';
import { FormAlert } from '@/components/form-alert';
import { StatusShape } from '@/components/status-shape';
import { buttonVariants } from '@/components/ui/button-variants';
import { useNoticeToast } from '@/components/undo-toast';
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

/** Thử lại for an admin on a failed job's item. */
export type RetryLabels = { readonly retry: string; readonly retryLabel: string; readonly queued: string; readonly failed: string };

const button = buttonVariants({ variant: 'outline' });

export function NoteActions({ id, status, labels, retry }: { id: string; status: InboxStatus; labels: NoteActionLabels; retry?: RetryLabels }) {
  const hydrated = useHydrated();
  const router = useRouter();
  const { pending, error, perform } = useUndoableAction({ failed: labels.failed, restoreFailed: labels.restoreFailed });
  const showNotice = useNoticeToast();
  const { pending: retrying, run } = useAction();
  const [retryFailed, setRetryFailed] = useState(false);
  const disabled = pending || retrying || !hydrated;
  const markRead = () => perform(() => setNoteStatus({ id, status: 'read' }));
  const dismiss = () => perform(() => setNoteStatus({ id, status: 'dismissed' }), { message: labels.dismissed, restore: () => setNoteStatus({ id, status }) });
  // The item leaves the inbox once the job is queued again, so the toast says so where the card was.
  const retryNow = () =>
    run(
      () => retryJob({ id }),
      (result) => {
        setRetryFailed(!result.ok);
        if (!result.ok || retry === undefined) return;
        showNotice(retry.queued);
        router.refresh();
      },
    );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {retry === undefined ? null : (
          <button type="button" onClick={retryNow} disabled={disabled} aria-label={retry.retryLabel} data-testid="note-retry" className={buttonVariants({ variant: 'primary' })}>
            <RotateCw aria-hidden="true" />
            {retry.retry}
          </button>
        )}
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
      <FormAlert message={retryFailed && retry !== undefined ? retry.failed : error} />
    </div>
  );
}

/** `Hoàn tác` on a hidden note's line in the thread: the note opens again where it was. */
export function RestoreNote({ id, labels }: { id: string; labels: { readonly undo: string; readonly undoLabel: string; readonly failed: string } }) {
  const hydrated = useHydrated();
  const router = useRouter();
  const { pending, run } = useAction();
  const [failed, setFailed] = useState(false);
  const restore = () =>
    run(
      () => setNoteStatus({ id, status: 'read' }),
      (result) => {
        setFailed(!result.ok);
        if (result.ok) router.refresh();
      },
    );
  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" onClick={restore} disabled={pending || !hydrated} aria-label={labels.undoLabel} data-testid="note-restore" className={buttonVariants({ variant: 'quiet' })}>
        <Undo2 aria-hidden="true" />
        {labels.undo}
      </button>
      <FormAlert message={failed ? labels.failed : null} />
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
export function ProposalActions({ id, status, labels, extras }: { id: string; status: InboxStatus | ProposalDecided['status']; labels: ProposalActionLabels; extras: ProposalExtras }) {
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
