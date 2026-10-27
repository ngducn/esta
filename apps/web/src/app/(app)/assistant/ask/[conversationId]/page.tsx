import { activityTime } from '@esta/core/activity';
import { MAX_QUESTION_LENGTH, idSchema } from '@esta/ops';
import { ArrowLeft } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AnswerStream } from '@/components/assistant/answer-stream';
import { AnswerView } from '@/components/assistant/answer-view';
import { AskForm } from '@/components/assistant/ask-form';
import { askFormLabels, thinkHarderFor } from '@/components/assistant/ask-labels';
import { AssistantHeader, assistantStatus } from '@/components/assistant/assistant-header';
import { AssistantMonogram } from '@/components/assistant/monogram';
import { SafeMarkdown } from '@/components/markdown/safe-markdown';
import { loadConversation, type ConversationMessage } from '@/server/agent/conversations';
import { getClock } from '@/server/clock';
import { env } from '@/server/env';
import { requireMember } from '@/server/member';

export { generateMetadata } from '../ask-metadata';

export default async function ConversationPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params;
  if (!idSchema.safeParse(conversationId).success) notFound();
  const member = await requireMember();
  const conversation = await loadConversation(member.household.id, conversationId);
  if (conversation === null) notFound();
  const clock = await getClock();
  const [status, t, assistant] = await Promise.all([assistantStatus(clock.now()), getTranslations('assistant.ask'), getTranslations('assistant')]);
  const labels = { streaming: t('answering'), deferred: t('deferred'), error: t('answerFailed'), stalled: t('stalled') };
  // A question over the day's cap waits for tomorrow, so the box would promise a follow-up that cannot come today.
  const deferred = conversation.messages.some((message) => message.status === 'deferred');

  const Turn = ({ message }: { message: ConversationMessage }) =>
    message.role === 'user' ? (
      <div data-testid="question" className="flex flex-col gap-1">
        <p className="text-small text-ink-muted">{t('askedAt', activityTime(message.createdAt, env.ESTA_TIMEZONE))}</p>
        <p className="text-lead font-medium break-words whitespace-pre-line text-ink">{message.content}</p>
      </div>
    ) : (
      <article className="flex flex-col gap-3 rounded-lg border border-rule bg-surface p-5 shadow-card sm:p-6">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <AssistantMonogram />
          <span className="text-small font-medium text-ink">{assistant('author')}</span>
        </header>
        {message.status === 'streaming' ? (
          <AnswerStream id={message.id} conversationId={conversation.id} initial={{ content: message.content, status: message.status, refs: message.refs }} labels={labels} />
        ) : (
          <AnswerView shown={message} labels={labels}>
            <SafeMarkdown refs={message.refs} className="max-w-prose">
              {message.content}
            </SafeMarkdown>
          </AnswerView>
        )}
      </article>
    );

  return (
    <div className="flex flex-col gap-6">
      <AssistantHeader householdId={member.household.id} now={clock.now()} status={status} active="ask" />
      <section aria-label={conversation.title} data-testid="conversation" className="flex max-w-3xl flex-col gap-5">
        {conversation.messages.map((message) => (
          <Turn key={message.id} message={message} />
        ))}
      </section>
      {deferred ? null : (
        <section aria-label={t('followUpLabel')} data-testid="follow-up" className="flex max-w-3xl flex-col gap-4 rounded-lg border border-rule bg-surface p-5 shadow-card sm:p-6">
          <AskForm
            conversationId={conversation.id}
            busy={conversation.messages.some((message) => message.status === 'streaming')}
            maxLength={MAX_QUESTION_LENGTH}
            labels={askFormLabels(t, true)}
            thinkHarder={thinkHarderFor(member.isOperator, t)}
          />
        </section>
      )}
      <Link href="/assistant/ask" data-testid="ask-another" className="inline-flex min-h-touch w-fit items-center gap-2 text-body font-medium text-ink underline underline-offset-4 hover:decoration-2">
        <ArrowLeft aria-hidden="true" className="size-5" />
        {t('askAnother')}
      </Link>
    </div>
  );
}
