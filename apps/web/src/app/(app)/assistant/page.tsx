import { businessDate, type Instant } from '@esta/core';
import { wallClockStamp, wallTime, workerStatus } from '@esta/core/agent';
import { formatDate } from '@esta/core/format';
import { Eye, History, Play, PlugZap, type LucideIcon } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Inbox } from '@/components/assistant/inbox';
import { WorkerStatusLine } from '@/components/assistant/worker-status-line';
import { SafeMarkdown } from '@/components/markdown/safe-markdown';
import { sectionMetadata } from '@/components/shell/section-page';
import { StatusShape, statusMarks, type MarkStatus } from '@/components/status-mark';
import { buttonVariants } from '@/components/ui/button';
import { ToastHost } from '@/components/undo-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { latestBrief, listInbox } from '@/server/agent/items';
import { getConnectionCheck, getWorkerHeartbeat, type AgentRun, type PingCheck } from '@/server/assistant';
import { getClock } from '@/server/clock';
import { env } from '@/server/env';
import { requireMember } from '@/server/member';
import { runConnectionCheck, runWatch } from './actions';
import { RefreshWhilePending } from './connection-check';

export const generateMetadata = () => sectionMetadata('assistant');

const jobMarks: Record<PingCheck['status'], MarkStatus> = { queued: 'due', running: 'due', done: 'paid', failed: 'overdue', cancelled: 'ended' };

const dateTime = (instant: Instant) => `${formatDate(businessDate(instant, env.ESTA_TIMEZONE), 'vi')} ${wallTime(instant, env.ESTA_TIMEZONE)}`;

function CardHeading({ id, icon: Icon, children }: { id: string; icon: LucideIcon; children: ReactNode }) {
  return (
    <h2 id={id} className="flex items-center gap-3 text-lead font-semibold text-ink">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-surface-2 text-ink-2">
        <Icon className="size-5" strokeWidth={1.8} aria-hidden="true" />
      </span>
      <span className="min-w-0 break-words">{children}</span>
    </h2>
  );
}

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
        <span className="text-small text-ink-muted">{t('latestCheck', { time: dateTime(job.requestedAt) })}</span>
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

async function RecentRuns({ runs }: { runs: readonly AgentRun[] }) {
  const [t, locale] = await Promise.all([getTranslations('assistant'), getLocale()]);
  if (runs.length === 0) return <p className="text-ink-muted">{t('noRuns')}</p>;
  const usd = new Intl.NumberFormat(locale === 'vi' ? 'vi-VN' : 'en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 });
  const columns = ['time', 'authMode', 'agentMode', 'model', 'turns', 'cost', 'toolCalls'] as const;
  return (
    <div role="region" aria-labelledby="runs-heading" tabIndex={0} className="-mx-5 -mb-5 overflow-x-auto sm:-mx-6 sm:-mb-6 [&_tr:last-child_td]:border-b-0">
      <Table data-testid="runs-table">
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column} scope="col" className={cn(['turns', 'cost'].includes(column) && 'text-end')}>
                {t(`columns.${column}`)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.map((run) => (
            <TableRow key={run.id} data-testid="run-row">
              <TableCell className="whitespace-nowrap figures">{dateTime(run.startedAt)}</TableCell>
              <TableCell>{run.authMode}</TableCell>
              <TableCell>{run.agentMode}</TableCell>
              <TableCell className="whitespace-nowrap">{run.model ?? t('unknown')}</TableCell>
              <TableCell className="text-end figures">{run.numTurns ?? t('unknown')}</TableCell>
              <TableCell className="text-end whitespace-nowrap figures">{run.costUsd === null ? t('unknown') : usd.format(run.costUsd)}</TableCell>
              <TableCell>
                {Object.keys(run.toolCalls).length === 0 ? (
                  <span className="text-ink-muted">{t('noToolCalls')}</span>
                ) : (
                  <ul className="flex flex-col">
                    {Object.entries(run.toolCalls).map(([name, count]) => (
                      <li key={name} className="whitespace-nowrap">
                        {t('toolCall', { name, count })}
                      </li>
                    ))}
                  </ul>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

const isPending = (job: JobView | null) => job?.status === 'queued' || job?.status === 'running';

/** Operator-only: the server never renders this for anyone else, so Mẹ's HTML carries no diagnostics (PLT-1). */
async function OperatorTools({ householdId, failed, workerOnline }: { householdId: string; failed: { check: boolean; watch: boolean }; workerOnline: boolean }) {
  const [t, { latest, watch, runs }] = await Promise.all([getTranslations('assistant'), getConnectionCheck(householdId)]);
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
      <section aria-labelledby="runs-heading" className="flex flex-col gap-4 rounded-lg border border-rule bg-surface p-5 shadow-card sm:p-6">
        <CardHeading id="runs-heading" icon={History}>
          {t('recentRuns')}
        </CardHeading>
        <RecentRuns runs={runs} />
      </section>
    </>
  );
}

export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ check?: string; watch?: string }> }) {
  const clock = await getClock();
  const member = await requireMember();
  const [lastSeenAt, notes, brief, nav, toast, { check, watch }] = await Promise.all([
    getWorkerHeartbeat(clock.now()),
    listInbox(member),
    latestBrief(member.household.id),
    getTranslations('nav'),
    getTranslations('components.toast'),
    searchParams,
  ]);
  const status = workerStatus(lastSeenAt, clock.now(), env.ESTA_TIMEZONE);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-h2 break-words lg:text-h1">{nav('assistant')}</h1>
        {status.kind === 'offline' ? null : <WorkerStatusLine status={status} lastRun={brief === null ? null : wallClockStamp(brief.createdAt, clock.now(), env.ESTA_TIMEZONE)} />}
      </div>
      <ToastHost labels={{ region: toast('region'), undo: toast('undo') }}>
        <Inbox notes={notes} today={clock.today()} timezone={env.ESTA_TIMEZONE} />
      </ToastHost>
      {member.isOperator ? (
        <OperatorTools householdId={member.household.id} failed={{ check: check === 'failed', watch: watch === 'failed' }} workerOnline={status.kind === 'online'} />
      ) : null}
    </div>
  );
}
