import type { ReactNode } from 'react';
import { wordmark } from '@/design/brand';
import { cn } from '@/lib/utils';
import './brand-layer.css';

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="font-display text-brand-eyebrow text-text-secondary uppercase">{children}</p>;
}

const lineClass = 'flex min-w-0 items-end gap-[0.25em]';

/** The title is the page's h1 and keeps its text; the second line, right-aligned, finishes the sentence. */
export function SplitHeadline({ title, end }: { title: string; end: string }) {
  return (
    <div className="grid font-display text-brand-title text-text">
      <div className={lineClass}>
        <h1 className="min-w-0 text-balance [font-weight:inherit]">{title}</h1>
        <span className="es-mk-rule" aria-hidden="true" />
      </div>
      <div className={cn(lineClass, 'es-mk-line--end')}>
        <span className="es-mk-rule" aria-hidden="true" />
        <p className="min-w-0 text-right text-balance">{end}</p>
      </div>
    </div>
  );
}

export function BrandFrame({ children }: { children: ReactNode }) {
  return <div className="es-mk-frame flex flex-col gap-6 rounded-xl bg-surface p-5 text-text sm:p-6">{children}</div>;
}

export function ReversedLogo({ className }: { className?: string }) {
  return (
    <svg viewBox={wordmark.viewBox} aria-hidden="true" className={cn('h-6 w-auto', className)}>
      <path d={wordmark.letters} className="fill-photo-ink" />
      <rect x={wordmark.square.x} y={wordmark.square.y} width={wordmark.square.size} height={wordmark.square.size} className="fill-photo-seal" />
    </svg>
  );
}

export function PhotoLines() {
  return <span aria-hidden="true" className="es-mk-lines pointer-events-none absolute inset-y-0 right-0 w-72 opacity-40" />;
}
