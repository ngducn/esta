'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { isAnswerEvent, type AnswerState } from './answer-state';
import { AnswerView, type AnswerLabels, type ShownAnswer } from './answer-view';

const fetchMarkdownChunk = () => import('@/components/markdown/safe-markdown');
const SafeMarkdown = dynamic(() => fetchMarkdownChunk().then((markdown) => markdown.SafeMarkdown));

export function AnswerStream({ id, conversationId, initial, labels }: { id: string; conversationId: string; initial: AnswerState; labels: AnswerLabels }) {
  const [shown, setShown] = useState<ShownAnswer>(initial);

  useEffect(() => {
    if (initial.status !== 'streaming') return;
    void fetchMarkdownChunk();
    const source = new EventSource(`/api/answers/${id}?conversation=${conversationId}`);
    source.onmessage = ({ data }: MessageEvent<string>) => {
      const next: unknown = JSON.parse(data);
      if (isAnswerEvent(next) && 'content' in next) setShown(next);
      else setShown((before) => ({ content: before.content, refs: before.refs, status: 'stalled' }));
      if (!isAnswerEvent(next) || next.status !== 'streaming') source.close();
    };
    return () => source.close();
  }, [id, conversationId, initial.status]);

  return (
    <AnswerView shown={shown} labels={labels}>
      <SafeMarkdown refs={shown.refs} className="max-w-prose">
        {shown.content}
      </SafeMarkdown>
    </AnswerView>
  );
}
