import { Eye, Play, PlugZap, type LucideIcon } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { runConnectionCheck, runWatch } from '@/app/(app)/assistant/actions';
import { RefreshWhilePending } from '@/app/(app)/assistant/connection-check';
import { SafeMarkdown } from '@/components/markdown/safe-markdown';
import { StatusShape, statusMarks, type MarkStatus } from '@/components/status-shape';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getConnectionCheck, type PingCheck } from '@/server/assistant';
import { CardHeading, operatorTime } from './operator-card';

const jobMarks: Record<PingCheck['status'], MarkStatus> = { queued: 'due', running: 'due', done: 'paid', failed: 'overdue', cancelled: 'ended' };

type JobView = Pick<PingCheck, 'status' | 'error' | 'requestedAt'>;

async function LatestJob({ job, testId, empty, children }: { job: JobView | null; testId: 'ping' | 'watch'; empty: string; children?: ReactNode }) {
  const t = await getTranslations('assistant');
  if (job === null) return <p className="text-ink-muted">{empty}</p>;
  const mark = jobMarks[job.status];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span
          data-testid={`${testId}-status`}
          data-status={job.status}
          className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-small font-medium', statusMarks[mark].pill)}
        >
          <StatusShape status={mark} className="size-4" />
          <span>{t(`jobStatus.${job.status}`)}</span>
        </span>
        <span className="text-small text-ink-muted">{t('latestCheck', { time: operatorTime(job.requestedAt) })}</span>
      </div>
      {children}
      {job.error !== null && job.status !== 'done' ? (
        <p data-testid={`${testId}-error`} className="text-small wrap-anywhere text-ink-2">
          {job.error}
        </p>
      ) : null}
    </div>
  );
}

type JobCardProps = {
  readonly id: string;
  readonly icon: LucideIcon;
  readonly title: string;
  readonly intro: string;
  readonly action: () => Promise<void>;
  readonly runLabel: string;
  readonly pending: boolean;
  readonly failedText: string | null;
  readonly children: ReactNode;
};

function JobCard({ id, icon, title, intro, action, runLabel, pending, failedText, children }: JobCardProps) {
  return (
    <section aria-labelledby={`${id}-heading`} data-testid={id} className="flex flex-col gap-4 rounded-lg border border-rule bg-surface p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex max-w-prose min-w-0 flex-col gap-2">
          <CardHeading id={`${id}-heading`} icon={icon}>
            {title}
          </CardHeading>
          <p className="text-body text-pretty text-ink-2">{intro}</p>
        </div>
        <form action={action}>
          <button type="submit" disabled={pending} className={buttonVariants({ variant: 'primary' })}>
            <Play aria-hidden="true" />
            {runLabel}
          </button>
        </form>
      </div>
      {failedText === null ? null : (
        <p role="alert" className="font-medium text-overdue">
          {failedText}
        </p>
      )}
      <div className="border-t border-rule pt-4">{children}</div>
    </section>
  );
}

const isPending = (job: JobView | null) => job?.status === 'queued' || job?.status === 'running';

/** Operator-only: the server never renders this for anyone else, so Mẹ's HTML carries no diagnostics (PLT-1). */
export async function OperatorTools({ householdId, failed, workerOnline }: { householdId: string; failed: { check: boolean; watch: boolean }; workerOnline: boolean }) {
  const [t, { latest, watch }] = await Promise.all([getTranslations('assistant'), getConnectionCheck(householdId)]);
  return (
    <>
      <JobCard
        id="connection-check"
        icon={PlugZap}
        title={t('check')}
        intro={t('checkIntro')}
        action={runConnectionCheck}
        runLabel={t('runCheck')}
        pending={isPending(latest)}
        failedText={failed.check ? t('checkSendFailed') : null}
      >
        <LatestJob job={latest} testId="ping" empty={t('noCheck')}>
          {latest === null || latest.reply === null ? null : (
            <div data-testid="ping-reply">
              <SafeMarkdown>{latest.reply}</SafeMarkdown>
            </div>
          )}
        </LatestJob>
      </JobCard>
      <JobCard
        id="watch-run"
        icon={Eye}
        title={t('watch')}
        intro={t('watchIntro')}
        action={runWatch}
        runLabel={t('runWatch')}
        pending={isPending(watch)}
        failedText={failed.watch ? t('watchSendFailed') : null}
      >
        <LatestJob job={watch} testId="watch" empty={t('noWatch')}>
          {watch?.status === 'done' && watch.notesAdded !== null ? (
            <p data-testid="watch-notes" className="text-body text-ink-2">
              {t('watchNotes', { count: watch.notesAdded })}
            </p>
          ) : null}
        </LatestJob>
      </JobCard>
      <RefreshWhilePending pending={(isPending(latest) || isPending(watch)) && workerOnline} />
    </>
  );
}
