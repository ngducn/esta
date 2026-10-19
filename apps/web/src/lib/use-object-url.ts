'use client';

import { useEffect, useMemo } from 'react';

/** A blob URL for `blob`, revoked when the blob changes or the component goes. */
export function useObjectUrl(blob: Blob | null): string | null {
  const url = useMemo(() => (blob === null ? null : URL.createObjectURL(blob)), [blob]);
  useEffect(() => () => (url === null ? undefined : URL.revokeObjectURL(url)), [url]);
  return url;
}
