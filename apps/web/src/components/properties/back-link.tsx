import { ChevronLeft } from 'lucide-react';
import { IntentLink } from '@/components/shell/intent-link';

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <IntentLink href={href} className="-ml-2 flex min-h-touch w-fit items-center gap-1 rounded-sm px-2 text-body font-semibold text-ink-2 hover:text-ink">
      <ChevronLeft className="size-5 shrink-0" strokeWidth={2} aria-hidden="true" />
      {label}
    </IntentLink>
  );
}
