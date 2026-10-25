'use client';

import { useEffect, useState } from 'react';
import { SafeMarkdown } from '@/components/markdown/safe-markdown';
import { isAnswerEvent, type AnswerState } from './answer-state';

export type AnswerLabels = Readonly<Record<'streaming' | 'error' | 'stalled', string>>;

type Shown = AnswerState | { readonly content: string; readonly refs: readonly string[]; readonly status: 'stalled' };

export function AnswerStream({ id, conversationId, initial, labels }: { id: string; conversationId: string; initial: AnswerState; labels: AnswerLabels }) {
  const [shown, setShown] = useState<Shown>(initial);
  const streaming = shown.status === 'streaming';

  useEffect(() => {
    if (initial.status !== 'streaming') return;
    const source = new EventSource(`/api/answers/${id}?conversation=${conversationId}`);
    source.onmessage = ({ data }: MessageEvent<string>) => {
      const next: unknown = JSON.parse(data);
      if (isAnswerEvent(next) && 'content' in next) setShown(next);
      else setShown((before) => ({ content: before.content, refs: before.refs, status: 'stalled' }));
      if (!isAnswerEvent(next) || next.status !== 'streaming') source.close();
    };
    return () => source.close();
  }, [id, conversationId, initial.status]);

  const line = shown.status === 'done' || (shown.status === 'streaming' && shown.content !== '') ? null : labels[shown.status];
  return (
    <div data-testid="answer" data-status={shown.status} aria-busy={streaming} className="flex flex-col gap-3">
      {shown.content === '' ? null : <SafeMarkdown refs={shown.refs} className="max-w-prose">{shown.content}</SafeMarkdown>}
      {line === null ? null : (
        <p role="status" data-testid="answer-line" className="text-body text-ink-muted">
          {line}
        </p>
      )}
    </div>
  );
}
