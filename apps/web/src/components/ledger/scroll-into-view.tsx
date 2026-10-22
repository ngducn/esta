'use client';

import { useEffect } from 'react';

/** Brings the element `id` names into view once, for a link such as `?month=2026-10` that lands on one row. */
export function ScrollIntoView({ id }: { id: string }) {
  useEffect(() => {
    document.getElementById(id)?.scrollIntoView({ block: 'center' });
  }, [id]);
  return null;
}
