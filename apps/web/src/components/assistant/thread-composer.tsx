'use client';

import type { ThreadTopic } from '@esta/core/assistant';
import { Send, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState, type FormEvent } from 'react';
import { sendQuestion } from '@/app/(app)/assistant/actions';
import { FormAlert } from '@/components/form-alert';
import { buttonVariants } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useAction } from '@/components/use-action';

export type ComposerLabels = Readonly<Record<'message' | 'placeholder' | 'send' | 'sending' | 'empty' | 'long' | 'failed' | 'busy' | 'deferred', string>>;

/** `busy` while an answer streams, `deferred` once the day's cap holds the last one until tomorrow: neither sends. */
export type ComposerState = 'ready' | 'busy' | 'deferred';

/** The note or property the next message is about, from `?reply=` or `?about=`; `Bỏ` drops it. */
export type ComposerTopic = { readonly topic: ThreadTopic; readonly label: string; readonly clear: string; readonly clearLabel: string };

/** A suggested reply: one tap sends its text with its note as the topic. */
export type ComposerSuggestion = { readonly text: string; readonly topic: ThreadTopic };

/**
 * The reply box at the end of the thread. The database picks the conversation (`ask_in_thread`), so the box sends only
 * the text and an id: a retry of the same text keeps its id and never asks twice. Only an operator's page passes
 * `thinkHarder`. A topic lives in the URL, so sending or `Bỏ` returns to `/assistant` without it.
 */
export function ThreadComposer({
  labels,
  maxLength,
  state,
  thinkHarder = null,
  topic = null,
  suggestions = null,
}: {
  labels: ComposerLabels;
  maxLength: number;
  state: ComposerState;
  thinkHarder?: { readonly label: string; readonly hint: string } | null;
  topic?: ComposerTopic | null;
  suggestions?: { readonly label: string; readonly items: readonly ComposerSuggestion[] } | null;
}) {
  const id = useId();
  const router = useRouter();
  const { pending, run } = useAction();
  const [message, setMessage] = useState('');
  const [deep, setDeep] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draft = useRef<{ readonly message: string; readonly questionId: string } | null>(null);
  const disabled = pending || state !== 'ready';

  const send = (text: string, about: ThreadTopic | null) => {
    if (draft.current?.message !== text) draft.current = { message: text, questionId: crypto.randomUUID() };
    const sent = draft.current;
    setError(null);
    run(
      () => sendQuestion({ questionId: sent.questionId, question: text, deep, topic: about }),
      (result) => {
        if (!result.ok) {
          setError(result.reason === 'invalid' ? labels.long : result.reason === 'busy' ? labels.busy : labels.failed);
          return;
        }
        draft.current = null;
        setMessage('');
        setDeep(false);
        if (topic === null) router.refresh();
        else router.replace('/assistant', { scroll: false });
      },
    );
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (message.trim() === '') setError(labels.empty);
    else send(message, topic?.topic ?? null);
  };

  const hint = error === null && state !== 'ready' ? labels[state] : null;
  return (
    <form onSubmit={submit} data-testid="composer" data-state={state} className="flex flex-col gap-3 rounded-lg border border-rule bg-surface p-4 shadow-card sm:p-5">
      <label htmlFor={id} className="text-body font-medium text-ink">
        {labels.message}
      </label>
      {suggestions === null || suggestions.items.length === 0 || topic !== null ? null : (
        <ul aria-label={suggestions.label} data-testid="composer-suggestions" className="flex flex-wrap gap-2">
          {suggestions.items.map((item) => (
            <li key={item.text} className="max-w-full">
              <button type="button" onClick={() => send(item.text, item.topic)} disabled={disabled} data-testid="composer-suggestion" className={buttonVariants({ variant: 'outline', className: 'h-auto max-w-full text-left whitespace-normal' })}>
                {item.text}
              </button>
            </li>
          ))}
        </ul>
      )}
      {topic === null ? null : (
        <div data-testid="composer-topic" className="flex min-w-0 items-center justify-between gap-2 rounded-md bg-surface-2 py-1 pl-3">
          <p className="min-w-0 text-small font-medium break-words text-ink-2">{topic.label}</p>
          <button type="button" onClick={() => router.replace('/assistant', { scroll: false })} disabled={pending} aria-label={topic.clearLabel} data-testid="composer-topic-clear" className={buttonVariants({ variant: 'quiet', className: 'shrink-0' })}>
            <X aria-hidden="true" />
            {topic.clear}
          </button>
        </div>
      )}
      <textarea
        id={id}
        autoFocus={topic !== null}
        data-testid="composer-message"
        value={message}
        rows={2}
        maxLength={maxLength}
        placeholder={labels.placeholder}
        disabled={disabled}
        aria-invalid={error === null ? undefined : true}
        aria-describedby={error !== null ? `${id}-error` : hint !== null ? `${id}-hint` : undefined}
        onChange={(event) => setMessage(event.target.value)}
        className="field-sizing-content max-h-[6.5lh] min-h-touch w-full resize-none overflow-y-auto rounded-md border border-field bg-surface px-3.5 py-2.5 text-body break-words text-ink placeholder:text-ink-muted hover:border-ink-muted disabled:cursor-not-allowed disabled:border-rule disabled:bg-surface-2 disabled:text-ink-muted"
      />
      {hint === null ? null : (
        <p id={`${id}-hint`} role="status" data-testid="composer-hint" className="text-small text-pretty text-ink-2">
          {hint}
        </p>
      )}
      {thinkHarder === null ? null : (
        <div className="flex items-start gap-1">
          <Checkbox id={`${id}-deep`} data-testid="composer-deep" checked={deep} disabled={disabled} onCheckedChange={setDeep} aria-describedby={`${id}-deep-hint`} className="-ml-2.5" />
          <div className="flex flex-col gap-0.5 pt-2.5">
            <label htmlFor={`${id}-deep`} className="text-body font-medium text-ink">
              {thinkHarder.label}
            </label>
            <p id={`${id}-deep-hint`} className="text-small text-pretty text-ink-muted">
              {thinkHarder.hint}
            </p>
          </div>
        </div>
      )}
      <FormAlert id={`${id}-error`} message={error} />
      <button type="submit" data-testid="composer-send" disabled={disabled} className={buttonVariants({ variant: 'primary', className: 'w-full sm:w-fit sm:self-end' })}>
        <Send aria-hidden="true" />
        {pending ? labels.sending : labels.send}
      </button>
    </form>
  );
}
