'use client';

import { useEffect } from 'react';

export function ScrollIntoView({ id }: { id: string }) {
  useEffect(() => {
    document.getElementById(id)?.scrollIntoView({ block: 'center' });
  }, [id]);
  return null;
}
