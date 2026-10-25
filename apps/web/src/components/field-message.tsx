import type { ReactNode } from 'react';
import { StatusShape } from './status-shape';

/** The line under a field: the parsed preview, or the error with the overdue diamond so it never relies on color. */
export function FieldMessage({ id, error, children }: { id: string; error: string | null; children?: ReactNode }) {
  return (
    <p id={id} aria-live="polite" className="flex min-h-7 items-start gap-2 text-body">
      {error === null ? (
        children
      ) : (
        <>
          <StatusShape status="overdue" className="mt-1 size-4" />
          <span className="min-w-0 text-overdue wrap-anywhere">{error}</span>
        </>
      )}
    </p>
  );
}
