import { wordmark } from '@/design/brand';
import { cn } from '@/lib/utils';

export function BrandMark({ name, className }: { name: string; className?: string }) {
  const { square } = wordmark;
  return (
    <svg viewBox={wordmark.viewBox} role="img" aria-label={name} className={cn('h-6 w-auto text-text', className)}>
      <path d={wordmark.letters} fill="currentColor" />
      <rect x={square.x} y={square.y} width={square.size} height={square.size} className="fill-accent" />
    </svg>
  );
}
