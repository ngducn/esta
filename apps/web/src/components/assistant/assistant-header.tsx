import { wallClockStamp, workerStatus, type WorkerStatus } from '@esta/core/agent';
import type { Instant } from '@esta/core';
import { getTranslations } from 'next-intl/server';
import { SectionTabs } from '@/components/shell/section-tabs';
import { latestBrief } from '@/server/agent/items';
import { getWorkerHeartbeat } from '@/server/assistant';
import { env } from '@/server/env';
import { stampLabel, WorkerStatusLine } from './worker-status-line';

const TABS = [
  { id: 'thread', href: '/assistant' },
  { id: 'market', href: '/assistant/market' },
] as const;

export type AssistantTab = (typeof TABS)[number]['id'];

/** The worker's state as of the clock, which the page title's status line and the operator tools both read. */
export async function assistantStatus(now: Instant): Promise<WorkerStatus> {
  return workerStatus(await getWorkerHeartbeat(now), now, env.ESTA_TIMEZONE);
}

export async function AssistantHeader({ householdId, now, status, active }: { householdId: string; now: Instant; status: WorkerStatus; active: AssistantTab }) {
  const [nav, t, brief] = await Promise.all([getTranslations('nav'), getTranslations('assistant'), latestBrief(householdId, now)]);
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-h2 break-words lg:text-h1">{nav('assistant')}</h1>
      {status.kind === 'offline' || status.kind === 'paused' ? null : <WorkerStatusLine status={status} />}
      {brief === null ? null : (
        <p data-testid="worker-ran" className="text-small text-ink-muted figures">
          {t('ranAt', { time: stampLabel(wallClockStamp(brief.createdAt, now, env.ESTA_TIMEZONE)) })}
        </p>
      )}
      <SectionTabs label={t('tabs')} tabs={TABS.map((tab) => ({ href: tab.href, label: t(`tab.${tab.id}`), current: tab.id === active }))} />
    </div>
  );
}
