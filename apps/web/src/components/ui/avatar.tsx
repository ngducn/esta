import { UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Vietnamese names put the given name last, so the initial is the first letter of the last word. */
export function givenInitial(displayName: string | null): string | null {
  const given = displayName?.trim().split(/\s+/).at(-1);
  return given ? given.charAt(0).toLocaleUpperCase('vi') : null;
}

const sizes = { sm: 'size-7', md: 'size-9', lg: 'size-11' } as const;

/** Everyone gets the neutral fill so colour never ranks people; only Trợ lý is ringed, and its caller passes `TL` as the initial. */
export function Avatar({ initial, assistant = false, size = 'md', label, className }: { initial: string | null; assistant?: boolean; size?: keyof typeof sizes; label?: string; className?: string }) {
  return (
    <span
      {...(label === undefined ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label })}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full text-label font-semibold',
        assistant ? 'bg-surface text-accent-text ring-[length:var(--stroke-strong)] ring-accent-text' : 'bg-neutral-bg text-neutral-text',
        sizes[size],
        className,
      )}
    >
      {initial ?? <UserRound className="size-1/2" aria-hidden="true" />}
    </span>
  );
}
