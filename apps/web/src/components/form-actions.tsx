import type { ReactNode } from 'react';

/** The cancel and submit row every sheet and dialog ends with: stacked with the submit first on a phone, side by side on a wide screen. */
export function FormActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">{children}</div>;
}
