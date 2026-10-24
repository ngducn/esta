'use client';

import { MessageCircle } from 'lucide-react';
import { lazy } from 'react';
import { buttonVariants } from '@/components/ui/button-variants';
import { DeferredPopup, useDeferredDialog } from '@/components/use-deferred-dialog';
import type { ReminderLabels, ReminderTarget } from '@/server/reminders/board';

const loadSheet = () => import('./ReminderSheet');
const ReminderSheet = lazy(loadSheet);

/** `Nhắc qua Zalo` on a board row: drafts the reminder for what the row still owes. */
export function ReminderAction({ label, title, target, labels }: { label: string; title: string; target: ReminderTarget; labels: ReminderLabels }) {
  const dialog = useDeferredDialog(loadSheet);
  return (
    <>
      <button type="button" data-testid="row-action-remind" {...dialog.triggerProps} className={buttonVariants({ variant: 'outline' })}>
        <MessageCircle aria-hidden="true" />
        {label}
      </button>
      <DeferredPopup dialog={dialog} popup={ReminderSheet} props={{ title, target, labels }} />
    </>
  );
}
