'use client';

import { useEffect } from 'react';

/**
 * Opens the thread where she reads it: at the note a link names, or at the end of the page, where the reply box sits
 * above the phone's tab bar rather than under it. A new entry, such as her message and its answer, returns there.
 */
export function ThreadScroll({ note, newest }: { note: string | null; newest: string | null }) {
  useEffect(() => {
    if (note === null) window.scrollTo({ top: document.documentElement.scrollHeight });
    else document.getElementById(note)?.scrollIntoView({ block: 'start' });
  }, [note, newest]);
  return null;
}
