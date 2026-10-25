import type { ReactNode, Ref } from 'react';
import type { AnswerState } from './answer-state';

export type AnswerLabels = Readonly<Record<'streaming' | 'error' | 'stalled', string>>;

export type ShownAnswer = AnswerState | { readonly content: string; readonly refs: readonly string[]; readonly status: 'stalled' };

export function AnswerView({ shown, labels, children, ref }: { shown: ShownAnswer; labels: AnswerLabels; children: ReactNode; ref?: Ref<HTMLDivElement> }) {
  const line = shown.status === 'done' || (shown.status === 'streaming' && shown.content !== '') ? null : labels[shown.status];
  return (
    <div ref={ref} data-testid="answer" data-status={shown.status} aria-busy={shown.status === 'streaming'} className="flex flex-col gap-3">
      {shown.content === '' ? null : children}
      {line === null ? null : (
        <p role="status" data-testid="answer-line" className="text-body text-ink-muted">
          {line}
        </p>
      )}
    </div>
  );
}
