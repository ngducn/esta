import { ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';

/** A source Trợ lý cites, as a small chip that opens the article in a new tab (DESIGN-BRIEF §5.5). */
export function CitationChip({ href, index, label, children }: { href: string; index?: number; label?: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      data-testid="citation-chip"
      className="inline-flex min-h-touch max-w-full items-center gap-2 rounded-full border border-border-strong bg-surface px-3 py-1 align-middle text-body-sm font-medium text-text no-underline transition-colors duration-(--duration-fast) ease-standard hover:border-border-field focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
    >
      {index === undefined ? null : (
        <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-full bg-bg-subtle text-body-sm num text-text-secondary">
          {index}
        </span>
      )}
      <span className="min-w-0 break-words num">{children}</span>
      <ExternalLink aria-hidden="true" className="size-4 shrink-0 text-text-muted" strokeWidth={1.8} />
    </a>
  );
}
