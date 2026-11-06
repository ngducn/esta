'use client';

import { WifiOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useOnline } from '@/lib/use-online';

function pageLink(event: MouseEvent): URL | null {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
  if (anchor === null || (anchor.getAttribute('target') ?? '_self') !== '_self' || anchor.hasAttribute('download')) return null;
  const url = new URL((anchor as HTMLAnchorElement).href, location.href);
  if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return null;
  return url;
}

/** Offline, a tap on a link would end on the browser's own error page; this keeps the screen and says why instead. */
export function OfflineGuard({ message }: { message: string }) {
  const online = useOnline();
  const [blocked, setBlocked] = useState(false);
  const notice = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (online) return;
    const onClick = (event: MouseEvent) => {
      if (pageLink(event) === null) return;
      event.preventDefault();
      setBlocked(true);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [online]);
  useEffect(() => {
    if (blocked) notice.current?.scrollIntoView({ block: 'center' });
  }, [blocked]);
  if (online || !blocked) return null;
  return (
    <p ref={notice} role="status" data-testid="offline-blocked" className="mb-5 flex items-start gap-3 rounded-md border border-border bg-bg-subtle px-4 py-3 text-body text-text">
      <WifiOff className="mt-0.5 size-5 shrink-0 text-text-muted" aria-hidden="true" />
      {message}
    </p>
  );
}
