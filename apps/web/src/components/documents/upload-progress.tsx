'use client';

import { useLocale, useTranslations } from 'next-intl';

const MB = 1024 * 1024;

/** The bar and its words: the percent and `Đang tải lên 4,2 / 10 MB`, so progress reads without the bar. */
export function UploadProgress({ loaded, total }: { loaded: number; total: number }) {
  const t = useTranslations('documents');
  const locale = useLocale();
  const percent = total === 0 ? 0 : Math.min(100, Math.floor((loaded / total) * 100));
  const megabytes = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  return (
    <div data-testid="upload-progress" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-body text-ink">
        <span className="figures">{t('progress', { done: megabytes.format(loaded / MB), total: megabytes.format(total / MB) })}</span>
        <span data-testid="upload-percent" className="figures font-semibold">
          {t('percent', { percent })}
        </span>
      </div>
      <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={t('percent', { percent })} className="h-2 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-accent transition-[width] duration-(--duration-fast) ease-standard" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
