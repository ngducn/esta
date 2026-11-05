'use client';

import { useRef, useState, type RefObject } from 'react';
import { TextField } from '@/components/form-parts';
import { useBillAction } from '@/components/invoices/use-bill-action';
import { SheetFooter } from '@/components/sheet-footer';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { inviteMember, type MemberActionRefusal } from '@/server/actions/members';
import type { Refusals } from './member-refusals';

export type InviteSheetLabels = {
  readonly title: string;
  readonly body: string;
  readonly email: string;
  readonly emailHint: string;
  readonly save: string;
  readonly saving: string;
  readonly close: string;
  readonly refusals: Refusals;
};

const FIELD_REFUSALS: ReadonlySet<MemberActionRefusal> = new Set(['invalid', 'alreadyMember', 'alreadyInvited']);

export default function InviteSheet({
  open,
  onOpenChange,
  finalFocus,
  labels,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  finalFocus: RefObject<HTMLButtonElement | null>;
  labels: InviteSheetLabels;
}) {
  const title = useRef<HTMLHeadingElement>(null);
  const [email, setEmail] = useState('');
  const { refusal, setRefusal, pending, run } = useBillAction<MemberActionRefusal>(() => onOpenChange(false));
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent data-testid="invite-sheet" initialFocus={title} finalFocus={finalFocus} className="gap-0 p-0 pb-0">
        <div className="flex flex-col gap-4 p-5 sm:p-6">
          <div className="flex flex-col gap-1">
            <SheetTitle ref={title} tabIndex={-1} className="outline-none">
              {labels.title}
            </SheetTitle>
            <SheetDescription>{labels.body}</SheetDescription>
          </div>
          <TextField
            label={labels.email}
            hint={labels.emailHint}
            value={email}
            onChange={(value) => {
              setEmail(value);
              setRefusal(null);
            }}
            error={refusal !== null && FIELD_REFUSALS.has(refusal) ? labels.refusals[refusal] : null}
            testId="invite-email"
            maxLength={254}
          />
        </div>
        <SheetFooter
          testId="invite"
          onSave={() => run(() => inviteMember({ email, role: 'viewer' }))}
          pending={pending}
          labels={{ cancel: labels.close, save: labels.save, saving: labels.saving }}
          error={refusal === null || FIELD_REFUSALS.has(refusal) ? null : labels.refusals[refusal]}
        />
      </SheetContent>
    </Sheet>
  );
}
