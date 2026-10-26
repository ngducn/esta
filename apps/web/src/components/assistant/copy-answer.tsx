'use client';

import { Copy } from 'lucide-react';
import { useRef } from 'react';
import { buttonVariants } from '@/components/ui/button-variants';
import { useNoticeToast } from '@/components/undo-toast';
import { useHydrated } from '@/lib/use-hydrated';

export type CopyAnswerLabels = { readonly copy: string; readonly copyLabel: string; readonly copied: string; readonly failed: string };

export function CopyAnswer({ text, labels }: { text: string; labels: CopyAnswerLabels }) {
  const hydrated = useHydrated();
  const notice = useNoticeToast();
  const button = useRef<HTMLButtonElement>(null);
  const copy = () =>
    // Off HTTPS `navigator.clipboard` is undefined, so the call goes inside the chain to fail as a refusal does.
    Promise.resolve()
      .then(() => navigator.clipboard.writeText(text))
      .then(
        () => notice(labels.copied),
        () => {
          const shown = button.current?.closest('article')?.querySelector('[data-testid="answer"]');
          if (shown) window.getSelection()?.selectAllChildren(shown);
          notice(labels.failed);
        },
      );
  return (
    <button
      ref={button}
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
  );
}
