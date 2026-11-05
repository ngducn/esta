import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { assistantStatus } from '@/components/assistant/assistant-header';
import { operatorTime } from '@/components/assistant/operator-card';
import { WorkerStatusLine } from '@/components/assistant/worker-status-line';
import { Card } from '@/components/ui/card';
import { loadDiagnostics } from '@/server/agent/diagnostics';
import { getClock } from '@/server/clock';
import type { Member } from '@/server/member';
import { loadResearchTopics } from '@/server/settings/load';
import { SettingsSection } from './settings-section';

const RECENT_RUNS = 5;

export async function AssistantSection({ member }: { member: Member }) {
  const clock = await getClock();
  const now = clock.now();
  const [t, status, topics, diagnostics] = await Promise.all([
    getTranslations('settings'),
    assistantStatus(now),
    loadResearchTopics(member.household.id),
    member.isOperator ? loadDiagnostics(member.household.id, now) : null,
  ]);
  return (
    <SettingsSection id="assistant" title={t('assistant')} intro={t('assistantIntro')}>
      <Card className="flex flex-col gap-4">
        <WorkerStatusLine status={status} />
        <div className="flex flex-col gap-2">
          <h3 className="text-headline font-semibold">{t('topics')}</h3>
          {topics.length === 0 ? (
            <p data-testid="topics-empty" className="text-text-muted">
              {t('topicsEmpty')}
            </p>
          ) : (
            <ul data-testid="topics" className="flex flex-col gap-1 text-body">
              {topics.map((label) => (
                <li key={label} className="break-words">
                  {label}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
      {diagnostics === null ? null : (
        <Card data-testid="assistant-runs" className="flex flex-col gap-3">
          <h3 className="text-headline font-semibold">{t('runs')}</h3>
          {diagnostics.runs.length === 0 ? (
            <p className="text-text-muted">{t('runsEmpty')}</p>
          ) : (
            <ul className="flex flex-col gap-1 text-body">
              {diagnostics.runs.slice(0, RECENT_RUNS).map((run) => (
                <li key={run.id} className="flex flex-wrap gap-x-3 text-text-secondary">
                  <span className="num">{operatorTime(run.startedAt)}</span>
                  <span className="text-text">{run.kind}</span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/assistant/diagnostics" className="inline-flex min-h-touch w-fit items-center text-body font-medium text-text-secondary underline underline-offset-4 hover:decoration-2">
            {t('runsAll')}
          </Link>
        </Card>
      )}
    </SettingsSection>
  );
}
