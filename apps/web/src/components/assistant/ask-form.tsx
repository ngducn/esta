'use client';

import { Send } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState, type FormEvent } from 'react';
import { sendQuestion } from '@/app/(app)/assistant/ask/actions';
import { FormAlert } from '@/components/form-alert';
import { buttonVariants } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useAction } from '@/components/use-action';

export type AskFormLabels = Readonly<Record<'question' | 'placeholder' | 'send' | 'sending' | 'empty' | 'long' | 'failed' | 'busy', string>>;

type Draft = { readonly question: string; readonly conversationId: string; readonly questionId: string };

/**
 * Asks a first question, or a follow-up when `conversationId` names the conversation. A retry of the same text keeps
 * its ids, so a send whose reply was lost never asks twice. Only an operator's page passes `thinkHarder`.
 */
export function AskForm({
  labels,
  maxLength,
  conversationId,
  busy = false,
  thinkHarder = null,
}: {
  labels: AskFormLabels;
  maxLength: number;
  conversationId?: string;
  busy?: boolean;
  thinkHarder?: { readonly label: string; readonly hint: string } | null;
}) {
  const id = useId();
  const router = useRouter();
  const { pending, run } = useAction();
  const [question, setQuestion] = useState('');
  const [deep, setDeep] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draft = useRef<Draft | null>(null);
  const disabled = pending || busy;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (question.trim() === '') {
      setError(labels.empty);
      return;
    }
    if (draft.current?.question !== question) draft.current = { question, conversationId: conversationId ?? crypto.randomUUID(), questionId: crypto.randomUUID() };
    const sent = draft.current;
    setError(null);
    run(
      () => sendQuestion({ id: sent.conversationId, questionId: sent.questionId, question, deep }),
      (result) => {
        if (!result.ok) {
          setError(result.reason === 'invalid' ? labels.long : result.reason === 'busy' ? labels.busy : labels.failed);
          return;
        }
        draft.current = null;
        if (conversationId === undefined) {
          router.push(`/assistant/ask/${result.value.id}`);
          return;
        }
        setQuestion('');
        setDeep(false);
        router.refresh();
      },
    );
  };

  const hint = busy && error === null ? labels.busy : null;
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label htmlFor={id} className="text-body font-medium text-ink">
        {labels.question}
      </label>
      <textarea
        id={id}
        data-testid="ask-question"
        value={question}
        rows={3}
        maxLength={maxLength}
        placeholder={labels.placeholder}
        disabled={disabled}
        aria-invalid={error === null ? undefined : true}
        aria-describedby={error !== null ? `${id}-error` : hint !== null ? `${id}-hint` : undefined}
        onChange={(event) => setQuestion(event.target.value)}
        className="min-h-touch w-full resize-y rounded-md border border-field bg-surface px-3.5 py-2.5 text-body break-words text-ink placeholder:text-ink-muted hover:border-ink-muted disabled:cursor-not-allowed disabled:border-rule disabled:bg-surface-2 disabled:text-ink-muted"
      />
      {hint === null ? null : (
        <p id={`${id}-hint`} data-testid="ask-busy" className="text-small text-pretty text-ink-muted">
          {hint}
        </p>
      )}
      {thinkHarder === null ? null : (
        <div className="flex items-start gap-1">
          <Checkbox id={`${id}-deep`} data-testid="ask-deep" checked={deep} disabled={disabled} onCheckedChange={setDeep} aria-describedby={`${id}-deep-hint`} className="-ml-2.5" />
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
      <button type="submit" data-testid="ask-send" disabled={disabled} className={buttonVariants({ variant: 'primary', className: 'w-full sm:w-fit' })}>
        <Send aria-hidden="true" />
        {pending ? labels.sending : labels.send}
      </button>
    </form>
  );
}
