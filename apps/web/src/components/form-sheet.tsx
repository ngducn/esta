'use client';

import type { FormEvent, ReactNode, RefObject } from 'react';
import { FormActions } from '@/components/form-actions';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogClose, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';

const SURFACES = {
  sheet: { Root: Sheet, Content: SheetContent, Title: SheetTitle, Description: SheetDescription, Close: SheetClose, contentClass: undefined },
  dialog: {
    Root: AlertDialog,
    Content: AlertDialogContent,
    Title: AlertDialogTitle,
    Description: AlertDialogDescription,
    Close: AlertDialogClose,
    contentClass: 'max-h-[calc(100dvh-2rem)] overflow-y-auto',
  },
} as const;

type FormSheetProps = {
  readonly surface?: keyof typeof SURFACES;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly finalFocus?: RefObject<HTMLButtonElement | null>;
  readonly testId: string;
  readonly title: ReactNode;
  readonly titleTestId?: string;
  readonly description?: ReactNode;
  readonly labels: { readonly cancel: string; readonly submit: string; readonly pending: string };
  readonly submitTestId: string;
  readonly pending: boolean;
  readonly submitDisabled?: boolean;
  /** Null when there is nothing to submit yet: the body shows alone with a cancel button. */
  readonly onSubmit: (() => void) | null;
  readonly error?: ReactNode;
  readonly leading?: ReactNode;
  readonly children: ReactNode;
};

/**
 * A sheet or dialog with a form: the title, the fields, one error line and the cancel and submit row. It will not close while
 * the write is pending, so a save cannot finish behind a closed sheet. The submit button is a form submit, so Enter saves; the event stops here because a dialog's portal still bubbles React events to a form that renders it.
 */
export function FormSheet({ surface = 'sheet', open, onOpenChange, finalFocus, testId, title, titleTestId, description, labels, submitTestId, pending, submitDisabled = false, onSubmit, error, leading, children }: FormSheetProps) {
  const { Root, Content, Title, Description, Close, contentClass } = SURFACES[surface];
  const submit = (event: FormEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onSubmit?.();
  };
  const actions = (
    <FormActions>
      {leading}
      <Close render={<Button type="button" variant="outline" disabled={pending} />}>{labels.cancel}</Close>
      {onSubmit === null ? null : (
        <Button type="submit" data-testid={submitTestId} disabled={pending || submitDisabled}>
          {pending ? labels.pending : labels.submit}
        </Button>
      )}
    </FormActions>
  );
  return (
    <Root open={open} onOpenChange={(next) => (next || !pending ? onOpenChange(next) : undefined)}>
      <Content data-testid={testId} finalFocus={finalFocus} className={contentClass}>
        <div className="flex flex-col gap-2">
          <Title data-testid={titleTestId}>{title}</Title>
          {description === undefined ? null : <Description>{description}</Description>}
        </div>
        {onSubmit === null ? (
          <div className="flex flex-col gap-5">
            {children}
            {error}
            {actions}
          </div>
        ) : (
          <form noValidate onSubmit={submit} className="flex flex-col gap-5">
            {children}
            {error}
            {actions}
          </form>
        )}
      </Content>
    </Root>
  );
}
