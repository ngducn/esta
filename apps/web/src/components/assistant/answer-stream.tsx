'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { isAnswerEvent, type AnswerEvent, type AnswerState } from './answer-state';
import { AnswerView, type AnswerLabels, type ShownAnswer } from './answer-view';

const fetchMarkdownChunk = () => import('@/components/markdown/safe-markdown');
const SafeMarkdown = dynamic(() => fetchMarkdownChunk().then((markdown) => markdown.SafeMarkdown));

export const reopensFollowUp = (event: AnswerEvent): boolean => event.status === 'done' || event.status === 'error';

export function AnswerStream({ id, conversationId, initial, labels }: { id: string; conversationId: string; initial: AnswerState; labels: AnswerLabels }) {
  const router = useRouter();
  const [shown, setShown] = useState<ShownAnswer>(initial);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initial.status !== 'streaming') return;
    void fetchMarkdownChunk();
    box.current?.scrollIntoView({ block: 'nearest' });
    const stall = () => setShown((before) => ({ content: before.content, refs: before.refs, status: 'stalled' }));
    const source = new EventSource(`/api/answers/${id}?conversation=${conversationId}`);
    source.onmessage = ({ data }: MessageEvent<string>) => {
      const next: unknown = JSON.parse(data);
      if (isAnswerEvent(next) && 'content' in next) setShown(next);
      else stall();
      if (!isAnswerEvent(next) || next.status !== 'streaming') source.close();
      if (isAnswerEvent(next) && reopensFollowUp(next)) router.refresh();
    };
    source.onerror = () => {
      if (source.readyState === EventSource.CLOSED) stall();
    };
    return () => source.close();
  }, [id, conversationId, initial.status, router]);

  return (
    <AnswerView ref={box} shown={shown} labels={labels}>
      <SafeMarkdown refs={shown.refs} className="max-w-prose">
        {shown.content}
      </SafeMarkdown>
    </AnswerView>
  );
}
