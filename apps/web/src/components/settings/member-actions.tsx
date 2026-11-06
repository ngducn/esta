'use client';

import { Trash2 } from 'lucide-react';
import { lazy, useState } from 'react';
import { FormAlert } from '@/components/form-alert';
import { FormSelect } from '@/components/properties/address-picker';
import { useBillAction } from '@/components/invoices/use-bill-action';
import { Button } from '@/components/ui/button';
import { DeferredPopup, useDeferredDialog } from '@/components/use-deferred-dialog';
import { can } from '@/server/access';
import { removeMember, setMemberRole, type MemberActionRefusal } from '@/server/actions/members';
import type { Refusals } from './member-refusals';

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
  readonly selfTitle: string;
  readonly selfBody: string;
  readonly selfConfirm: string;
  readonly refusals: Refusals;
};

const ROLES = ['admin', 'member', 'viewer'] as const;
type Role = (typeof ROLES)[number];

/**
 * An admin changes a role in place or removes the person behind a confirm that names them. Lowering your own role asks
 * first, since it costs every control. The operator's row never gets these controls: SQL refuses both.
 */
export function MemberActions({ id, role, self, labels }: { id: string; role: Role; self: boolean; labels: MemberActionLabels }) {
  const { refusal, pending, run } = useBillAction<MemberActionRefusal>();
  const confirm = useDeferredDialog(loadConfirm);
  const [lowered, setLowered] = useState<Role>(role);
  const change = (next: Role) => {
    if (!self || can({ role: next }, 'household')) return run(() => setMemberRole({ id, role: next }));
    setLowered(next);
    confirm.setOpen(true);
  };
  const confirmProps = self
    ? { title: labels.selfTitle, description: labels.selfBody, confirmLabel: labels.selfConfirm, cancelLabel: labels.keep, onConfirm: () => run(() => setMemberRole({ id, role: lowered })) }
    : { title: labels.removeTitle, description: labels.removeBody, confirmLabel: labels.removeConfirm, cancelLabel: labels.keep, onConfirm: () => run(() => removeMember({ id })) };
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-44 flex-1 sm:flex-none">
        <FormSelect
          label={labels.role}
          testId="member-role"
          value={role}
          disabled={pending}
          options={ROLES.map((value) => ({ value, label: labels.roles[value] }))}
          onChange={(value) => {
            const next = ROLES.find((candidate) => candidate === value);
            if (next !== undefined) change(next);
          }}
        />
      </div>
      {self ? null : (
        <Button type="button" variant="secondary" data-testid="remove-member" disabled={pending} {...confirm.triggerProps}>
          <Trash2 aria-hidden="true" />
          {labels.remove}
        </Button>
      )}
      <DeferredPopup dialog={confirm} popup={ConfirmDialogPopup} props={confirmProps} />
      <div className="basis-full empty:hidden">
        <FormAlert message={refusal === null ? null : labels.refusals[refusal]} data-testid="member-error" />
      </div>
    </div>
  );
}
