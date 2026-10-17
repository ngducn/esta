'use client';

import { createContext, useContext, type ReactNode } from 'react';

export type ErrorLabels = { title: string; body: string; retry: string };

const ErrorLabelsContext = createContext<ErrorLabels | null>(null);

/** An error boundary renders on the client with no message files, so the segment's layout hands it the words. */
export function ErrorLabelsProvider({ labels, children }: { labels: ErrorLabels; children: ReactNode }) {
  return <ErrorLabelsContext value={labels}>{children}</ErrorLabelsContext>;
}

export function useErrorLabels(): ErrorLabels {
  const labels = useContext(ErrorLabelsContext);
  if (labels === null) throw new Error('useErrorLabels needs an ErrorLabelsProvider above it');
  return labels;
}
