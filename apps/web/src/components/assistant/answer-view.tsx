import type { ReactNode } from 'react';
import type { AnswerState } from './answer-state';

export type AnswerLabels = Readonly<Record<'streaming' | 'error' | 'stalled', string>>;

export type ShownAnswer = AnswerState | { readonly content: string; readonly refs: readonly string[]; readonly status: 'stalled' };

/**
 * An answer's box: its text, rendered by `children`, and the line for one that is waiting, failed or stalled. The page renders
 * a settled answer here on the server, and `AnswerStream` renders a running one, so only a running answer ships Markdown JS.
 */
export function AnswerView({ shown, labels, children }: { shown: ShownAnswer; labels: AnswerLabels; children: ReactNode }) {
  const line = shown.status === 'done' || (shown.status === 'streaming' && shown.content !== '') ? null : labels[shown.status];
  return (
    <div data-testid="answer" data-status={shown.status} aria-busy={shown.status === 'streaming'} className="flex flex-col gap-3">
      {shown.content === '' ? null : children}
      {line === null ? null : (
        <p role="status" data-testid="answer-line" className="text-body text-ink-muted">
          {line}
        </p>
      )}
    </div>
  );
}
