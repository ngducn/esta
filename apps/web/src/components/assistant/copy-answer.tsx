'use client';

import { Copy } from 'lucide-react';
import { useRef, type ReactNode } from 'react';
import { buttonVariants } from '@/components/ui/button-variants';
import { useNoticeToast } from '@/components/undo-toast';
import { useHydrated } from '@/lib/use-hydrated';

export type CopyAnswerLabels = { readonly copy: string; readonly copyLabel: string; readonly copied: string; readonly failed: string };

/** The answer it wraps, then a button that copies `text`; when the clipboard refuses, the answer is left selected. */
export function CopyAnswer({ text, labels, children }: { text: string; labels: CopyAnswerLabels; children: ReactNode }) {
  const hydrated = useHydrated();
  const notice = useNoticeToast();
  const answer = useRef<HTMLDivElement>(null);
  const copy = () =>
    // Off HTTPS `navigator.clipboard` is undefined, so the call goes inside the chain to fail as a refusal does.
    Promise.resolve()
      .then(() => navigator.clipboard.writeText(text))
      .then(
        () => notice(labels.copied),
        () => {
          if (answer.current !== null) window.getSelection()?.selectAllChildren(answer.current);
          notice(labels.failed);
        },
      );
  return (
    <>
      <div ref={answer} className="contents">
        {children}
      </div>
      <button
        type="button"
        onClick={() => void copy()}
        disabled={!hydrated}
        aria-label={labels.copyLabel}
        data-testid="answer-copy"
        className={buttonVariants({ variant: 'outline', className: 'self-start' })}
      >
        <Copy aria-hidden="true" />
        {labels.copy}
      </button>
    </>
  );
}
