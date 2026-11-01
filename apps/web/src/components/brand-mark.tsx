import { tile, wordmark } from '@/design/brand';
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

export function BrandTile({ name, className }: { name: string; className?: string }) {
  return (
    <svg viewBox={tile.viewBox} role="img" aria-label={name} className={cn('size-9', className)}>
      <rect width="64" height="64" rx={tile.radius} className="fill-accent" />
      <g transform={tile.transform} className="fill-on-accent">
        <path d={tile.letter} />
        <rect x={tile.square.x} y={tile.square.y} width={tile.square.size} height={tile.square.size} />
      </g>
    </svg>
  );
}
