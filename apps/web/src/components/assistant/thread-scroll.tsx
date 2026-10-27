'use client';

import { useEffect, useRef } from 'react';

const END_SLACK_PX = 48;

/**
 * Opens the thread where she reads it: at the note a link names, or at the end of the page, where the reply box sits
 * above the phone's tab bar rather than under it. While she is at the end, the page stays there as an answer grows and
 * when a refresh hides the thread for a moment, which would otherwise leave her at the top.
 */
export function ThreadScroll({ note, newest }: { note: string | null; newest: string | null }) {
  const arrival = useRef<{ readonly newest: string | null; readonly anchor: string } | null>(null);
  useEffect(() => {
    arrival.current ??= { newest, anchor: window.location.hash.slice(1) };
    const hashUntilThreadGrows = arrival.current.newest === newest ? arrival.current.anchor : '';
    const anchor = note ?? hashUntilThreadGrows;
    const target = anchor === '' ? null : document.getElementById(anchor);
    if (target !== null) {
      target.scrollIntoView({ block: 'start' });
      return;
    }
    const thread = document.getElementById('thread');
    const toEnd = () => window.scrollTo({ top: document.documentElement.scrollHeight });
    let atEnd = true;
    const onScroll = () => {
      if (thread === null || thread.offsetHeight === 0) return;
      atEnd = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - END_SLACK_PX;
    };
    const resized = new ResizeObserver(() => {
      if (atEnd) toEnd();
    });
    toEnd();
    resized.observe(document.body);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      resized.disconnect();
      window.removeEventListener('scroll', onScroll);
    };
  }, [note, newest]);
  return null;
}
