'use client';

import type { ProposalDecided } from '@esta/ops';
import { Check, EyeOff, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { approveProposal, setNoteStatus } from '@/app/(app)/assistant/actions';
import { FormAlert } from '@/components/form-alert';
import { StatusShape } from '@/components/status-mark';
import { buttonVariants } from '@/components/ui/button-variants';
import { useAction } from '@/components/use-action';
import { useUndoableAction } from '@/components/use-undoable-action';
import { useHydrated } from '@/lib/use-hydrated';
import type { InboxStatus } from '@/server/agent/items';

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
  readonly skip: string;
  readonly skipLabel: string;
  readonly skipped: string;
  readonly approved: string;
  readonly notApplicable: string;
  readonly failed: string;
  readonly restoreFailed: string;
};

/** What an approval decided, as the card says it. */
export function ProposalDecision({ decision, labels }: { decision: ProposalDecided['status']; labels: Pick<ProposalActionLabels, 'approved' | 'notApplicable'> }) {
  return (
    <p role="status" data-testid="proposal-decision" data-decision={decision} className="flex items-center gap-2 text-body font-medium text-ink">
      <StatusShape status={decision === 'approved' ? 'paid' : 'ended'} className="size-4" />
      {decision === 'approved' ? labels.approved : labels.notApplicable}
    </p>
  );
}

/** `Đồng ý` runs the approval once; `Bỏ qua` dismisses with undo. A second tap or a stale tab reads what was decided. */
export function ProposalActions({ id, status, labels }: { id: string; status: InboxStatus; labels: ProposalActionLabels }) {
  const hydrated = useHydrated();
  const router = useRouter();
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
  const skip = () => perform(() => setNoteStatus({ id, status: 'dismissed' }), { message: labels.skipped, restore: () => setNoteStatus({ id, status }) });

  if (decision !== null) return <ProposalDecision decision={decision} labels={labels} />;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={approve} disabled={disabled} aria-label={labels.approveLabel} data-testid="proposal-approve" className={buttonVariants({ variant: 'primary' })}>
          <Check aria-hidden="true" />
          {labels.approve}
        </button>
        <button type="button" onClick={skip} disabled={disabled} aria-label={labels.skipLabel} data-testid="proposal-skip" className={button}>
          <X aria-hidden="true" />
          {labels.skip}
        </button>
      </div>
      <FormAlert message={approveError ?? error} />
    </div>
  );
}
