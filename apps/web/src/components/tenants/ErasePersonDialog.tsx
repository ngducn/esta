'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FormAlert } from '@/components/form-alert';
import { FormSheet } from '@/components/form-sheet';
import { useAction } from '@/components/use-action';
import type { PopupProps } from '@/components/use-deferred-dialog';
import { erasePerson, type ErasePersonRefusal } from '@/server/actions/parties';

export type EraseLabels = {
  readonly question: string;
  readonly body: string;
  readonly confirm: string;
  readonly cancel: string;
  readonly working: string;
  readonly refusals: Readonly<Record<ErasePersonRefusal, string>>;
};

/** The confirm names the person, as the voice guide asks, and a refusal says what to do first. */
export default function ErasePersonDialog({ partyId, labels, open, onOpenChange, finalFocus }: PopupProps & { partyId: string; labels: EraseLabels }) {
  const router = useRouter();
  const [refusal, setRefusal] = useState<keyof EraseLabels['refusals'] | null>(null);
  const { pending, run } = useAction();

  const confirm = () =>
    run(
      () => erasePerson(partyId),
      (result) => {
        if (result.ok) {
          router.refresh();
          onOpenChange(false);
          return;
        }
        setRefusal(result.reason);
        if (result.reason === 'files_left') router.refresh();
      },
    );

  return (
    <FormSheet
      surface="dialog"
      open={open}
      onOpenChange={onOpenChange}
      finalFocus={finalFocus}
      testId="erase-dialog"
      title={labels.question}
      titleTestId="erase-question"
      description={labels.body}
      labels={{ cancel: labels.cancel, submit: labels.confirm, pending: labels.working }}
      submitTestId="erase-confirm"
      pending={pending}
      onSubmit={refusal === 'files_left' ? null : confirm}
      error={refusal === null ? null : <FormAlert message={labels.refusals[refusal]} data-testid="erase-refusal" data-reason={refusal} />}
    >
      {null}
    </FormSheet>
  );
}
