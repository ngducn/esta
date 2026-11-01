import Link from 'next/link';
import { cn } from '@/lib/utils';

export type ChoiceLink = { readonly key: string; readonly label: string; readonly href: string; readonly current: boolean };

/** A row of pill links that pick one view of the page, such as a year or an owner; shown only when there is a choice. */
export function ChoiceLinks({ label, choices, testId }: { label: string; choices: readonly ChoiceLink[]; testId?: string }) {
  if (choices.length < 2) return null;
  return (
    <nav aria-label={label} data-testid={testId}>
      <ul className="flex flex-wrap gap-2">
        {choices.map((choice) => (
          <li key={choice.key} className="min-w-0">
            <Link
              href={choice.href}
              aria-current={choice.current ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-touch max-w-full items-center rounded-full border px-4 text-body-sm font-medium wrap-anywhere num transition-colors duration-(--duration-fast) ease-standard',
                choice.current ? 'border-accent-border bg-accent-subtle text-accent-text' : 'border-border-strong bg-surface text-text hover:border-border-field',
              )}
            >
              {choice.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
