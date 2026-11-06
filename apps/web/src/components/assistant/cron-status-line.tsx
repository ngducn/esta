import type { CronHealth, CronJob } from '@esta/core/ops';
import { TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';

const JOB_KEYS = {
  invoices: 'cronJobInvoices',
  lease_status: 'cronJobLeaseStatus',
  document_sweep: 'cronJobDocumentSweep',
  keep_alive: 'cronJobKeepAlive',
} as const satisfies Record<CronJob, string>;

/** Shown to the operator beside the worker line, and only when a nightly job failed or has not finished in time. */
export function CronStatusLine({ health }: { health: CronHealth }) {
  const t = useTranslations('assistant');
  if (health.kind === 'ok') return null;
  const names = (jobs: readonly CronJob[]) => jobs.map((job) => t(JOB_KEYS[job])).join(', ');
  return (
    <div role="status" className="flex items-start gap-3 rounded-md bg-warning-bg px-4 py-3 text-body font-medium text-warning-text">
      <TriangleAlert className="mt-0.5 size-5 shrink-0" strokeWidth={2} aria-hidden="true" />
      <div className="flex min-w-0 flex-col gap-1 break-words">
        {health.failed.length > 0 ? <p>{t('cronFailed', { jobs: names(health.failed) })}</p> : null}
        {health.stale.length > 0 ? <p>{t('cronStale', { jobs: names(health.stale) })}</p> : null}
      </div>
    </div>
  );
}
