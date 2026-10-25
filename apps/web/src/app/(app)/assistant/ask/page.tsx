import { activityTime } from '@esta/core/activity';
import { MAX_QUESTION_LENGTH } from '@esta/ops';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { AskForm } from '@/components/assistant/ask-form';
import { askFormLabels, thinkHarderFor } from '@/components/assistant/ask-labels';
import { AssistantHeader, assistantStatus } from '@/components/assistant/assistant-header';
import { listConversations } from '@/server/agent/conversations';
import { getClock } from '@/server/clock';
import { env } from '@/server/env';
import { requireMember } from '@/server/member';

export { generateMetadata } from './ask-metadata';

export default async function AskPage() {
  const clock = await getClock();
  const member = await requireMember();
  const [status, t, conversations] = await Promise.all([assistantStatus(clock.now()), getTranslations('assistant.ask'), listConversations(member.household.id)]);
  return (
    <div className="flex flex-col gap-6">
      <AssistantHeader householdId={member.household.id} now={clock.now()} status={status} active="ask" />
      <section aria-labelledby="ask-heading" data-testid="ask" className="flex max-w-2xl flex-col gap-4 rounded-lg border border-rule bg-surface p-5 shadow-card sm:p-6">
        <div className="flex flex-col gap-2">
          <h2 id="ask-heading" className="text-h3 font-semibold text-ink">
            {t('heading')}
          </h2>
          <p className="max-w-prose text-body text-pretty text-ink-2">{t('intro')}</p>
        </div>
        <AskForm maxLength={MAX_QUESTION_LENGTH} labels={askFormLabels(t, false)} thinkHarder={thinkHarderFor(member.isOperator, t)} />
      </section>
      <section aria-labelledby="earlier-heading" data-testid="conversations" className="flex max-w-2xl flex-col gap-2">
        <h2 id="earlier-heading" className="text-lead font-semibold text-ink">
          {t('earlier')}
        </h2>
        {conversations.length === 0 ? (
          <p className="max-w-prose text-body text-pretty text-ink-muted">{t('earlierEmpty')}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-rule rounded-lg border border-rule bg-surface">
            {conversations.map((conversation) => (
              <li key={conversation.id}>
                <Link href={`/assistant/ask/${conversation.id}`} data-testid="conversation-link" className="flex min-h-touch flex-col gap-1 px-4 py-3 hover:bg-surface-2">
                  <span className="line-clamp-2 text-body font-medium break-words text-ink">{conversation.title}</span>
                  <span className="text-small text-ink-muted">{t('lastAsked', activityTime(conversation.lastAskedAt, env.ESTA_TIMEZONE))}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
