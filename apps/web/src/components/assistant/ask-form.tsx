'use client';

import { Send } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';
import { sendQuestion } from '@/app/(app)/assistant/ask/actions';
import { FormAlert } from '@/components/form-alert';
import { buttonVariants } from '@/components/ui/button';
import { useAction } from '@/components/use-action';

export type AskFormLabels = Readonly<Record<'question' | 'placeholder' | 'send' | 'sending' | 'empty' | 'long' | 'failed', string>>;

/** One question to Trợ lý; the conversation id is minted per send, so a held-down button asks once. */
export function AskForm({ labels, maxLength }: { labels: AskFormLabels; maxLength: number }) {
  const id = useId();
  const router = useRouter();
  const { pending, run } = useAction();
  const [question, setQuestion] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (question.trim() === '') {
      setError(labels.empty);
      return;
    }
    const conversation = crypto.randomUUID();
    setError(null);
    run(
      () => sendQuestion({ id: conversation, question }),
      (sent) => {
        if (sent.ok) router.push(`/assistant/ask/${sent.value.id}`);
        else setError(sent.reason === 'invalid' ? labels.long : labels.failed);
      },
    );
  };

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
        disabled={pending}
        aria-invalid={error === null ? undefined : true}
        aria-describedby={error === null ? undefined : `${id}-error`}
        onChange={(event) => setQuestion(event.target.value)}
        className="min-h-touch w-full resize-y rounded-md border border-field bg-surface px-3.5 py-2.5 text-body text-ink placeholder:text-ink-muted hover:border-ink-muted disabled:cursor-not-allowed disabled:border-rule disabled:bg-surface-2 disabled:text-ink-muted"
      />
      <FormAlert id={`${id}-error`} message={error} />
      <button type="submit" data-testid="ask-send" disabled={pending} className={buttonVariants({ variant: 'primary', className: 'w-full sm:w-fit' })}>
        <Send aria-hidden="true" />
        {pending ? labels.sending : labels.send}
      </button>
    </form>
  );
}
