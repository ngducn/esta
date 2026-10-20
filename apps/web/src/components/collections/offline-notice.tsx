'use client';

import { WifiOff } from 'lucide-react';
import { useOnline } from '@/lib/use-online';

/** A server-rendered screen is its last load once offline; this says so instead of letting the next tap fail silently. */
export function OfflineNotice({ message, testId = 'collections-offline' }: { message: string; testId?: string }) {
  if (useOnline()) return null;
  return (
    <p role="status" data-testid={testId} className="flex items-start gap-3 rounded-md border border-rule bg-surface-2 px-4 py-3 text-body text-ink">
      <WifiOff className="mt-0.5 size-5 shrink-0 text-ink-muted" aria-hidden="true" />
      {message}
    </p>
  );
}
