import { ArrowLeft } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { idSchema } from '@esta/ops';
import { AnswerStream } from '@/components/assistant/answer-stream';
import { AssistantHeader, assistantStatus } from '@/components/assistant/assistant-header';
import { AssistantMonogram } from '@/components/assistant/monogram';
import { loadConversation, type ConversationMessage } from '@/server/agent/conversations';
import { getClock } from '@/server/clock';
import { requireMember } from '@/server/member';

export { generateMetadata } from '../page';

export default async function ConversationPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params;
  if (!idSchema.safeParse(conversationId).success) notFound();
  const clock = await getClock();
  const member = await requireMember();
  const [conversation, status, t, assistant] = await Promise.all([loadConversation(member.household.id, conversationId), assistantStatus(clock.now()), getTranslations('assistant.ask'), getTranslations('assistant')]);
  if (conversation === null) notFound();
  const labels = { streaming: t('answering'), error: t('answerFailed'), stalled: t('stalled') };

  const Turn = ({ message }: { message: ConversationMessage }) =>
    message.role === 'user' ? (
      <div data-testid="question" className="flex flex-col gap-1">
        <p className="text-small text-ink-muted">{t('asked')}</p>
        <p className="text-lead font-medium break-words whitespace-pre-line text-ink">{message.content}</p>
      </div>
    ) : (
      <article className="flex flex-col gap-3 rounded-lg border border-rule bg-surface p-5 shadow-card sm:p-6">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <AssistantMonogram />
          <span className="text-small font-medium text-ink">{assistant('author')}</span>
        </header>
        <AnswerStream id={message.id} conversationId={conversation.id} initial={{ content: message.content, status: message.status, refs: message.refs }} labels={labels} />
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
      <Link href="/assistant/ask" data-testid="ask-another" className="inline-flex min-h-touch w-fit items-center gap-2 text-body font-medium text-ink underline underline-offset-4 hover:decoration-2">
        <ArrowLeft aria-hidden="true" className="size-5" />
        {t('askAnother')}
      </Link>
    </div>
  );
}
