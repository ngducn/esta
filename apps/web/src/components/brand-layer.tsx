import type { ReactNode } from 'react';
import { wordmark } from '@/design/brand';
import { cn } from '@/lib/utils';
import './brand-layer.css';

/** Spaced capitals over a headline, saying what the page is. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('block font-display text-xs leading-4 font-medium tracking-[0.18em] text-text-secondary uppercase', className)}>{children}</span>;
}

const lineClass = 'flex min-w-0 items-end gap-[0.25em]';

/**
 * The split headline. The title is the page's h1 and keeps its text; the second line, right-aligned, finishes the
 * sentence. Each line is ruled with a short heavy segment at its inner end.
 */
export function SplitHeadline({ title, end }: { title: string; end: string }) {
  return (
    <div className="grid font-display text-[clamp(2rem,4vw,3rem)] leading-[1.22] font-[300] tracking-[-0.03em] text-text">
      <div className={lineClass}>
        <h1 className="min-w-0 font-[300] text-balance">{title}</h1>
        <span className="es-mk-rule" aria-hidden="true" />
      </div>
      <div className={cn(lineClass, 'es-mk-line--end')}>
        <span className="es-mk-rule" aria-hidden="true" />
        <p className="min-w-0 text-right text-balance">{end}</p>
      </div>
    </div>
  );
}

/** The double frame: a hairline card with a second hairline offset down and right. */
export function BrandFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('es-mk-frame flex flex-col gap-6 rounded-xl bg-surface p-5 text-text sm:p-6', className)}>{children}</div>
  );
}

/** The reversed logo (white letters, light-blue seal) for a dark ground such as a photo. */
export function ReversedLogo({ className }: { className?: string }) {
  const { square } = wordmark;
  return (
    <svg viewBox={wordmark.viewBox} aria-hidden="true" className={cn('h-6 w-auto', className)}>
      <path d={wordmark.letters} fill="#ffffff" />
      <rect x={square.x} y={square.y} width={square.size} height={square.size} fill="#689cfe" />
    </svg>
  );
}

/** Fine vertical lines fading across a photo. */
export function PhotoLines({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn('es-mk-lines pointer-events-none absolute inset-y-0 right-0 w-72 opacity-40', className)} />;
}
