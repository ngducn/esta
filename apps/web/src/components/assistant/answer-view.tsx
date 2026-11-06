import type { AnswerRef, SourceRef } from '@esta/core/assistant';
import type { ReactNode, Ref } from 'react';
import { CitationChip } from './citation-chip';
import { isSourceRef, type AnswerState } from './answer-state';

export type AnswerLabels = Readonly<Record<'streaming' | 'deferred' | 'error' | 'stalled' | 'searching', string>> & { /** The messages `assistant.citationLabel` ({index}, {source}) and `assistant.market.source` ({name}, {date}), filled here because a client island holds no translator. */ readonly citation: string; readonly dated: string};

export type ShownAnswer = AnswerState | { readonly content: string; readonly refs: readonly AnswerRef[]; readonly status: 'stalled'; readonly activity?: null };

/** The links an answer's text may hold: its record links, never its source chips. */
export const linkRefs = (refs: readonly AnswerRef[]): string[] => refs.filter((ref) => typeof ref === 'string');

export function AnswerView({ shown, labels, children, ref }: { shown: ShownAnswer; labels: AnswerLabels; children: ReactNode; ref?: Ref<HTMLDivElement> }) {
  const searching = shown.status === 'streaming' && shown.content === '' && shown.activity === 'web';
  const line = shown.status === 'done' || (shown.status === 'streaming' && shown.content !== '') ? null : searching ? labels.searching : labels[shown.status];
  const sources = shown.refs.filter(isSourceRef);
  const named = (source: SourceRef) => (source.published_on === null ? source.source_name : labels.dated.replace('{name}', source.source_name).replace('{date}', source.published_on.split('-').reverse().join('/')));
  return (
    <div ref={ref} data-testid="answer" data-status={shown.status} data-activity={searching ? 'web' : undefined} aria-busy={shown.status === 'streaming'} className="flex flex-col gap-3">
      {shown.content === '' ? null : children}
      {sources.length === 0 ? null : (
        <ol data-testid="answer-sources" className="flex flex-col items-start gap-2">
          {sources.map((source) => (
            <li key={source.url} className="max-w-full">
              <CitationChip href={source.url} index={source.n} label={labels.citation.replace('{index}', String(source.n)).replace('{source}', named(source))}>
                {named(source)}
              </CitationChip>
            </li>
          ))}
        </ol>
      )}
      {line === null ? null : (
        <p role="status" data-testid="answer-line" className="text-body text-text-muted">
          {line}
        </p>
      )}
    </div>
  );
}
