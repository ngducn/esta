'use client';

import { useEffect, useState } from 'react';
import { SafeMarkdown } from '@/components/markdown/safe-markdown';
import type { AnswerState } from '@/server/agent/conversations';

/** The line under the answer while it has none yet, after it failed, or once the page stopped listening. */
export type AnswerLabels = Readonly<Record<'streaming' | 'error' | 'stalled', string>>;

type Shown = AnswerState | { readonly content: string; readonly status: 'stalled' };

/**
 * The answer as the worker writes it, sentence by sentence, from `/api/answers/{id}` (AGENT.md §5.6). Text appears as
 * it lands, with no typing animation; a static line stands until the first sentence (DESIGN-BRIEF §5.5).
 */
export function AnswerStream({ id, conversationId, initial, labels }: { id: string; conversationId: string; initial: AnswerState; labels: AnswerLabels }) {
  const [shown, setShown] = useState<Shown>(initial);
  const streaming = shown.status === 'streaming';

  useEffect(() => {
    if (initial.status !== 'streaming') return;
    const source = new EventSource(`/api/answers/${id}?conversation=${conversationId}`);
    source.onmessage = ({ data }: MessageEvent<string>) => {
      const next = JSON.parse(data) as AnswerState | { status: 'timeout' | 'gone' };
      if ('content' in next) setShown(next);
      else setShown((before) => ({ content: before.content, status: 'stalled' }));
      if (next.status !== 'streaming') source.close();
    };
    return () => source.close();
  }, [id, conversationId, initial.status]);

  const line = shown.status === 'done' || (shown.status === 'streaming' && shown.content !== '') ? null : labels[shown.status];
  return (
    <div data-testid="answer" data-status={shown.status} aria-busy={streaming} className="flex flex-col gap-3">
      {shown.content === '' ? null : <SafeMarkdown links="in-app" className="max-w-prose">{shown.content}</SafeMarkdown>}
      {line === null ? null : (
        <p role="status" data-testid="answer-line" className="text-body text-ink-muted">
          {line}
        </p>
      )}
    </div>
  );
}
