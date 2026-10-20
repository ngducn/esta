import { StatusShape } from '@/components/status-mark';

/** One refusal line beside the button that caused it, with the overdue diamond so it never relies on color. */
export function ActionRefusal({ message }: { message: string | null }) {
  if (message === null) return null;
  return (
    <p role="alert" data-testid="invoice-action-refusal" className="flex items-start gap-2 text-body text-overdue">
      <StatusShape status="overdue" className="mt-1 size-4" />
      <span className="min-w-0 wrap-anywhere">{message}</span>
    </p>
  );
}
