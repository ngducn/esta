'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { SafeMarkdown } from '@/components/markdown/safe-markdown';
import { answerEventSchema, type AnswerState } from './answer-state';

export type AnswerLabels = Readonly<Record<'streaming' | 'error' | 'stalled', string>>;

type Shown = AnswerState | { readonly content: string; readonly refs: readonly string[]; readonly status: 'stalled' };

export function AnswerStream({ id, conversationId, initial, labels }: { id: string; conversationId: string; initial: AnswerState; labels: AnswerLabels }) {
  const router = useRouter();
  const [shown, setShown] = useState<Shown>(initial);
  const box = useRef<HTMLDivElement>(null);
  const streaming = shown.status === 'streaming';

  useEffect(() => {
    if (initial.status !== 'streaming') return;
    // A follow-up's answer appears above the box she typed in, so bring it into view.
    box.current?.scrollIntoView({ block: 'nearest' });
    const source = new EventSource(`/api/answers/${id}?conversation=${conversationId}`);
    source.onmessage = ({ data }: MessageEvent<string>) => {
      const next = answerEventSchema.safeParse(JSON.parse(data));
      if (next.success && 'content' in next.data) setShown(next.data);
      else setShown((before) => ({ content: before.content, refs: before.refs, status: 'stalled' }));
      if (!next.success || next.data.status !== 'streaming') source.close();
      // The page renders the follow-up box closed while an answer streams; a settled answer opens it.
      if (next.success && (next.data.status === 'done' || next.data.status === 'error')) router.refresh();
    };
    source.onerror = () => {
      if (source.readyState === EventSource.CLOSED) setShown((before) => ({ content: before.content, refs: before.refs, status: 'stalled' }));
    };
    return () => source.close();
  }, [id, conversationId, initial.status, router]);

  const line = shown.status === 'done' || (shown.status === 'streaming' && shown.content !== '') ? null : labels[shown.status];
  return (
    <div ref={box} data-testid="answer" data-status={shown.status} aria-busy={streaming} className="flex flex-col gap-3">
      {shown.content === '' ? null : <SafeMarkdown refs={shown.refs} className="max-w-prose">{shown.content}</SafeMarkdown>}
      {line === null ? null : (
        <p role="status" data-testid="answer-line" className="text-body text-ink-muted">
          {line}
        </p>
      )}
    </div>
  );
}
