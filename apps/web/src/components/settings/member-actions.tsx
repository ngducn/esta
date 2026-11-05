'use client';

import { Trash2 } from 'lucide-react';
import { lazy } from 'react';
import { FormAlert } from '@/components/form-alert';
import { FormSelect } from '@/components/properties/address-picker';
import { useBillAction } from '@/components/invoices/use-bill-action';
import { Button } from '@/components/ui/button';
import { DeferredPopup, useDeferredDialog } from '@/components/use-deferred-dialog';
import { removeMember, setMemberRole, type MemberActionRefusal } from '@/server/actions/members';
import type { Refusals } from './settings-labels';

const loadConfirm = () => import('@/components/confirm-dialog-popup');
const ConfirmDialogPopup = lazy(loadConfirm);

export type MemberActionLabels = {
  readonly role: string;
  readonly roles: Readonly<Record<'admin' | 'member' | 'viewer', string>>;
  readonly remove: string;
  readonly removeTitle: string;
  readonly removeBody: string;
  readonly removeConfirm: string;
  readonly keep: string;
  readonly refusals: Refusals;
};

/** An admin changes a role in place or removes the person behind a confirm that names them. The guards in SQL decide what is refused. */
export function MemberActions({ id, role, canRemove, labels }: { id: string; role: 'admin' | 'member' | 'viewer'; canRemove: boolean; labels: MemberActionLabels }) {
  const { refusal, pending, run } = useBillAction<MemberActionRefusal>();
  const confirm = useDeferredDialog(loadConfirm);
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-44 flex-1 sm:flex-none">
        <FormSelect
          label={labels.role}
          testId="member-role"
          value={role}
          disabled={pending}
          options={(['admin', 'member', 'viewer'] as const).map((value) => ({ value, label: labels.roles[value] }))}
          onChange={(next) => run(() => setMemberRole({ id, role: next }))}
        />
      </div>
      {canRemove ? (
        <>
          <Button type="button" variant="secondary" data-testid="remove-member" disabled={pending} {...confirm.triggerProps}>
            <Trash2 aria-hidden="true" />
            {labels.remove}
          </Button>
          <DeferredPopup
            dialog={confirm}
            popup={ConfirmDialogPopup}
            props={{ title: labels.removeTitle, description: labels.removeBody, confirmLabel: labels.removeConfirm, cancelLabel: labels.keep, onConfirm: () => run(() => removeMember({ id })) }}
          />
        </>
      ) : null}
      <div className="basis-full empty:hidden">
        <FormAlert message={refusal === null ? null : labels.refusals[refusal]} data-testid="member-error" />
      </div>
    </div>
  );
}
