import { useTranslations } from 'next-intl';

export function CompletenessRing({ percent, missing }: { percent: number; missing: number }) {
  const t = useTranslations('components.completeness');
  return <CompletenessRingView percent={percent} srLabel={t('percent', { percent: clamp(percent) })} label={t('missing', { count: missing })} />;
}

const clamp = (percent: number) => Math.min(100, Math.max(0, Math.round(percent)));

/**
 * `percent` is the weighted completeness score. On a card the count of missing items is the part people act on, so it
 * is the `label` and the percent is `srLabel`. Labels come translated, so a card renders it on either side of the client
 * boundary.
 */
export function CompletenessRingView({ percent, label, srLabel }: { percent: number; label: string; srLabel?: string }) {
  const filled = clamp(percent);
  return (
    <span data-testid="completeness-ring" data-percent={filled} className="inline-flex items-center gap-2">
      <svg viewBox="0 0 24 24" className="size-6 shrink-0 -rotate-90" fill="none" strokeWidth={3} aria-hidden="true">
        <circle cx="12" cy="12" r="9.5" className="stroke-rule" />
        {filled > 0 ? (
          <circle
            cx="12"
            cy="12"
            r="9.5"
            pathLength={100}
            strokeDasharray={`${filled} 100`}
            strokeLinecap={filled === 100 ? 'butt' : 'round'}
            className={filled === 100 ? 'stroke-paid' : 'stroke-accent'}
          />
        ) : null}
      </svg>
      {srLabel === undefined ? null : <span className="sr-only">{srLabel}</span>}
      <span className="text-body text-ink">{label}</span>
    </span>
  );
}
