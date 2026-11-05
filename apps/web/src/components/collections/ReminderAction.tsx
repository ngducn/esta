'use client';

import { MessageCircle } from 'lucide-react';
import { lazy } from 'react';
import { buttonVariants } from '@/components/ui/button-variants';
import { DeferredPopup, useDeferredDialog } from '@/components/use-deferred-dialog';
import type { ReminderLabels, ReminderTarget } from '@/server/reminders/board';

const loadSheet = () => import('./ReminderSheet');
const ReminderSheet = lazy(loadSheet);

/** `Nhắc qua Zalo` on a board row: drafts the reminder for what the row still owes. `initialOpen` opens it on arrival. */
export function ReminderAction({
  label,
  title,
  target,
  labels,
  initialOpen = false,
  className = buttonVariants({ variant: 'secondary' }),
  labelClassName,
}: {
  label: string;
  title: string;
  target: ReminderTarget;
  labels: ReminderLabels;
  initialOpen?: boolean;
  className?: string;
  labelClassName?: string | undefined;
}) {
  const dialog = useDeferredDialog(loadSheet, initialOpen);
  return (
    <>
      <button type="button" data-testid="row-action-remind" data-label={label} {...dialog.triggerProps} className={className}>
        <MessageCircle aria-hidden="true" />
        <span className={labelClassName}>{label}</span>
      </button>
      <DeferredPopup dialog={dialog} popup={ReminderSheet} props={{ title, target, labels }} />
    </>
  );
}
