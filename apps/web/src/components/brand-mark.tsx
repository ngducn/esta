import { brandHousePath } from '@/design/brand';
import { cn } from '@/lib/utils';

export function BrandMark({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-accent text-on-accent">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d={brandHousePath} />
        </svg>
      </span>
      <span className="text-h3 font-semibold tracking-tight text-ink">{name}</span>
    </span>
  );
}
