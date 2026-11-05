'use client';

import { UserPlus } from 'lucide-react';
import { lazy } from 'react';
import { Button } from '@/components/ui/button';
import { DeferredPopup, useDeferredDialog } from '@/components/use-deferred-dialog';
import type { InviteSheetLabels } from './invite-sheet';

const loadSheet = () => import('./invite-sheet');
const InviteSheet = lazy(loadSheet);

export function InviteButton({ label, labels }: { label: string; labels: InviteSheetLabels }) {
  const sheet = useDeferredDialog(loadSheet);
  return (
    <>
      <Button type="button" variant="primary" data-testid="invite-member" className="self-start" {...sheet.triggerProps}>
        <UserPlus aria-hidden="true" />
        {label}
      </Button>
      <DeferredPopup dialog={sheet} popup={InviteSheet} props={{ labels }} />
    </>
  );
}
