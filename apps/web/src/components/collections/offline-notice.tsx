'use client';

import { WifiOff } from 'lucide-react';
import { useOnline } from '@/lib/use-online';

/** The board is server-rendered, so offline it is the last load; this says so instead of letting a month change fail silently. */
export function OfflineNotice({ message }: { message: string }) {
  if (useOnline()) return null;
  return (
    <p role="status" data-testid="collections-offline" className="flex items-start gap-3 rounded-md border border-rule bg-surface-2 px-4 py-3 text-body text-ink">
      <WifiOff className="mt-0.5 size-5 shrink-0 text-ink-muted" aria-hidden="true" />
      {message}
    </p>
  );
}
