import { MAX_QUESTION_LENGTH } from '@esta/ops';
import { getTranslations } from 'next-intl/server';
import { AskForm } from '@/components/assistant/ask-form';
import { AssistantHeader, assistantStatus } from '@/components/assistant/assistant-header';
import { getClock } from '@/server/clock';
import { requireMember } from '@/server/member';

export { generateMetadata } from './ask-metadata';

export default async function AskPage() {
  const clock = await getClock();
  const member = await requireMember();
  const [status, t] = await Promise.all([assistantStatus(clock.now()), getTranslations('assistant.ask')]);
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
        <AskForm
          maxLength={MAX_QUESTION_LENGTH}
          labels={{ question: t('questionLabel'), placeholder: t('placeholder'), send: t('send'), sending: t('sending'), empty: t('emptyQuestion'), long: t('longQuestion'), failed: t('sendFailed') }}
        />
      </section>
    </div>
  );
}
