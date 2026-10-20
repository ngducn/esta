'use client';

import { draftReminder, type FormOfAddress } from '@esta/core/reminder';
import { Check, Copy, MessageCircle } from 'lucide-react';
import { useId, useMemo, useRef, useState } from 'react';
import { buttonVariants } from '@/components/ui/button-variants';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import type { ReminderLabels, ReminderTarget } from '@/server/reminders/board';

type CopyState = 'idle' | 'copied' | 'failed';

/**
 * LSE-11, loaded on the first `Nhắc qua Zalo`. Mẹ picks how to address the tenant, copies the Vietnamese draft and opens
 * the tenant's Zalo chat to paste it; Esta sends nothing itself. Where the clipboard is refused, the draft is left
 * selected so a long press copies it.
 */
export default function ReminderSheet({
  open,
  onOpenChange,
  title,
  target,
  labels,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  target: ReminderTarget;
  labels: ReminderLabels;
}) {
  const [form, setForm] = useState<FormOfAddress>(target.defaultForm);
  const [copy, setCopy] = useState<CopyState>('idle');
  const titleRef = useRef<HTMLHeadingElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);
  const radios = useId();
  const noPhone = useId();
  const text = useMemo(
    () => draftReminder({ ...target.draft, form, qrUrl: target.qrPath === null ? null : new URL(target.qrPath, window.location.origin).href }),
    [form, target],
  );

  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(text);
      setCopy('copied');
    } catch {
      if (textRef.current !== null) window.getSelection()?.selectAllChildren(textRef.current);
      setCopy('failed');
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent data-testid="reminder-sheet" initialFocus={titleRef} className="gap-0 p-0 pb-0">
        <div className="flex flex-col gap-5 p-5 sm:p-6">
          <div className="flex flex-col gap-1">
            <SheetTitle ref={titleRef} tabIndex={-1} className="break-words outline-none">
              {title}
            </SheetTitle>
            <SheetDescription className="flex flex-wrap gap-x-3">
              <span className="break-words">{target.draft.tenantName}</span>
              {target.zalo === null ? null : <span className="figures">{target.zalo.phone}</span>}
            </SheetDescription>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-body font-semibold text-ink">{labels.form}</legend>
            <div className="flex flex-wrap gap-2">
              {labels.forms.map(({ key, label }) => (
                <label
                  key={key}
                  className="inline-flex min-h-touch cursor-pointer items-center gap-1.5 rounded-full border border-field bg-surface px-4 text-body font-semibold text-ink transition-colors duration-(--duration-fast) ease-standard hover:border-ink-muted has-checked:border-ink has-checked:bg-surface-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent"
                >
                  <input
                    type="radio"
                    name={radios}
                    value={key}
                    checked={form === key}
                    onChange={() => {
                      setForm(key);
                      setCopy('idle');
                    }}
                    className="sr-only"
                  />
                  {form === key ? <Check aria-hidden="true" className="size-4 shrink-0" /> : null}
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-col gap-2">
            <h3 className="text-body font-semibold text-ink">{labels.text}</h3>
            <p
              ref={textRef}
              data-testid="reminder-text"
              lang="vi"
              className="rounded-md border border-rule bg-surface-2 p-4 text-body wrap-anywhere whitespace-pre-wrap text-ink"
            >
              {text}
            </p>
          </div>

          {target.zalo === null ? null : (
            <p data-testid="reminder-zalo-note" className="rounded-md border border-rule bg-surface-2 p-3 text-body text-ink">
              <span className="mr-2 inline-flex rounded-full bg-due-fill px-2.5 py-0.5 text-small font-semibold text-due">{labels.assumption}</span>
              {labels.zaloNote}
            </p>
          )}
        </div>

        <div className="sticky bottom-0 mt-auto flex flex-col gap-2 border-t border-rule bg-surface px-5 pt-3 pb-[max(--spacing(5),env(safe-area-inset-bottom))] sm:px-6">
          <p role="status" data-testid="reminder-copy-status" className={cn('text-body', copy === 'failed' ? 'text-overdue' : 'text-ink-2', copy === 'idle' && 'sr-only')}>
            {copy === 'copied' ? labels.copied : copy === 'failed' ? labels.copyFailed : null}
          </p>
          <button type="button" data-testid="reminder-copy" onClick={() => void copyDraft()} className={buttonVariants({ variant: 'primary' })}>
            {copy === 'copied' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            {labels.copy}
          </button>
          <div className="flex gap-2">
            {target.zalo === null ? (
              <button type="button" data-testid="reminder-zalo" disabled aria-describedby={noPhone} className={cn(buttonVariants({ variant: 'outline' }), 'flex-1')}>
                <MessageCircle aria-hidden="true" />
                {labels.openZalo}
              </button>
            ) : (
              <a href={target.zalo.url} target="_blank" rel="noopener noreferrer" data-testid="reminder-zalo" className={cn(buttonVariants({ variant: 'outline' }), 'flex-1')}>
                <MessageCircle aria-hidden="true" />
                {labels.openZalo}
              </a>
            )}
            <SheetClose className={cn(buttonVariants({ variant: 'outline' }), 'flex-1')}>{labels.close}</SheetClose>
          </div>
          {target.zalo === null ? (
            <p id={noPhone} data-testid="reminder-no-phone" className="text-body text-ink-2">
              {labels.noPhone}
            </p>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
