'use client';

import { buttonVariants } from '@/components/ui/button';

export function FocusComposerButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      data-testid="thread-empty-compose"
      onClick={() => {
        const box = document.querySelector<HTMLTextAreaElement>('form[data-testid="composer"] textarea');
        box?.scrollIntoView({ block: 'center' });
        box?.focus({ preventScroll: true });
      }}
      className={buttonVariants({ variant: 'secondary', className: 'mt-2' })}
    >
      {label}
    </button>
  );
}
