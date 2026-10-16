import { House } from 'lucide-react';
import { cn } from '@/lib/utils';

/** The white house on a lacquer-red square; `scripts/app-icons.ts` draws the same mark for the app icon. */
export function BrandMark({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-accent text-on-accent">
        <House className="size-5" strokeWidth={2} />
      </span>
      <span className="text-h3 font-bold tracking-tight text-ink">{name}</span>
    </span>
  );
}
