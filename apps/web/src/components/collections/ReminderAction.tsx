'use client';

import { MessageCircle } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { buttonVariants } from '@/components/ui/button-variants';
import { useDeferredDialog } from '@/components/use-deferred-dialog';
import type { ReminderLabels, ReminderTarget } from '@/server/reminders/board';

const loadSheet = () => import('./ReminderSheet');
const ReminderSheet = lazy(loadSheet);

/** `Nhắc qua Zalo` on a board row: drafts the reminder for what the row still owes. */
export function ReminderAction({ label, title, tenant, target, labels }: { label: string; title: string; tenant: string; target: ReminderTarget; labels: ReminderLabels }) {
  const { open, setOpen, triggerProps } = useDeferredDialog(loadSheet);
  return (
    <>
      <button type="button" data-testid="row-action-remind" {...triggerProps} className={buttonVariants({ variant: 'outline' })}>
        <MessageCircle aria-hidden="true" />
        {label}
      </button>
      {open === null ? null : (
        <Suspense fallback={null}>
          <ReminderSheet open={open} onOpenChange={setOpen} title={title} tenant={tenant} target={target} labels={labels} />
        </Suspense>
      )}
    </>
  );
}
