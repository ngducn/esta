import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

export function CompletenessRing({ percent, missing }: { percent: number; missing: number }) {
  const t = useTranslations('components.completeness');
  return <CompletenessRingView percent={percent} srLabel={t('percent', { percent: clamp(percent) })} label={t('missing', { count: missing })} />;
}

const clamp = (percent: number) => Math.min(100, Math.max(0, Math.round(percent)));

export function CompletenessRingView({ percent, label, srLabel }: { percent: number; label: string; srLabel?: string }) {
  const filled = clamp(percent);
  const full = filled === 100;
  return (
    <span data-testid="completeness-ring" data-percent={filled} className="inline-flex items-center gap-1.5 text-body-sm">
      <svg viewBox="0 0 20 20" className="size-icon-md shrink-0 overflow-visible" fill="none" strokeWidth={2.5} aria-hidden="true">
        <circle cx="10" cy="10" r="8" pathLength={100} className={filled === 0 ? 'stroke-border-field [stroke-dasharray:2.4_2.6]' : 'stroke-border-strong'} />
        {filled > 0 ? (
          <circle
            cx="10"
            cy="10"
            r="8"
            pathLength={100}
            strokeDasharray={`${filled} 100`}
            strokeLinecap="round"
            className={cn('origin-center -rotate-90 [transform-box:fill-box]', full ? 'stroke-success-text' : 'stroke-text-secondary')}
          />
        ) : null}
        {full ? <path d="M6.6 10.3l2.3 2.3 4.5-4.9" strokeLinecap="round" strokeLinejoin="round" className="stroke-success-text" /> : null}
      </svg>
      {srLabel === undefined ? null : <span className="sr-only">{srLabel}</span>}
      <span className={cn(full ? 'font-medium text-success-text' : filled === 0 ? 'text-text-muted' : 'text-text-secondary')}>{label}</span>
    </span>
  );
}
