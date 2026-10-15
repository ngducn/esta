import { useTranslations } from 'next-intl';

/** `percent` is the weighted completeness score; the count of missing items is the part people act on, so it is the text. */
export function CompletenessRing({ percent, missing }: { percent: number; missing: number }) {
  const t = useTranslations('components.completeness');
  const filled = Math.min(100, Math.max(0, Math.round(percent)));
  return (
    <span data-percent={filled} className="inline-flex items-center gap-2">
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
            className="stroke-ink"
          />
        ) : null}
      </svg>
      <span className="sr-only">{t('percent', { percent: filled })}</span>
      <span className="text-body text-ink">{t('missing', { count: missing })}</span>
    </span>
  );
}
