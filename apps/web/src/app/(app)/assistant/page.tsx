import { getTranslations } from 'next-intl/server';
import { AssistantHeader, assistantStatus } from '@/components/assistant/assistant-header';
import { PinnedItems } from '@/components/assistant/pinned-items';
import { TaskList } from '@/components/assistant/task-list';
import { ThreadView } from '@/components/assistant/thread';
import { sectionMetadata } from '@/components/shell/section-page';
import { ToastHost } from '@/components/undo-toast';
import { loadProposalDetails } from '@/server/agent/proposal-details';
import { loadSuggestions } from '@/server/agent/suggestions';
import { loadThread } from '@/server/agent/thread';
import { loadTopicChoice } from '@/server/agent/topic';
import { getClock } from '@/server/clock';
import { env } from '@/server/env';
import { requireMember } from '@/server/member';
import { loadReminderLabels } from '@/server/reminders/board';
import { loadOpenTasks } from '@/server/tasks/load';

export const generateMetadata = () => sectionMetadata('assistant');

const single = (value: string | string[] | undefined) => (typeof value === 'string' ? value : undefined);

export default async function AssistantPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [clock, member, params] = await Promise.all([getClock(), requireMember(), searchParams]);
  const note = single(params.note);
  const before = single(params.before);
  const reply = single(params.reply);
  const about = single(params.about);
  const places = await getTranslations('collections');
  const [status, thread, tasks, toast, topic, suggestions] = await Promise.all([
    assistantStatus(clock.now()),
    loadThread(member, { ...(note === undefined ? {} : { note }), ...(before === undefined ? {} : { before }) }),
    loadOpenTasks(member.household.id),
    getTranslations('components.toast'),
    loadTopicChoice(member.household.id, { ...(reply === undefined ? {} : { reply }), ...(about === undefined ? {} : { about }) }),
    loadSuggestions(member.household.id, (unit, property) => places('place', { unit, property })),
  ]);
  const canDecide = member.role !== 'viewer';
  const notes = thread.entries.flatMap((entry) => (entry.kind === 'note' ? [entry.note] : []));
  const details = await loadProposalDetails(member.household.id, notes, clock.today(), canDecide);
  const reminderLabels = [...details.values()].some((detail) => detail.reminder !== null) ? await loadReminderLabels() : null;
  return (
    <div className="flex flex-col gap-6">
      <AssistantHeader householdId={member.household.id} now={clock.now()} status={status} active="thread" />
      <ToastHost labels={{ region: toast('region'), undo: toast('undo') }}>
        <PinnedItems pinned={thread.pinned} loaded={new Set(notes.map(({ id }) => id))} />
        <TaskList tasks={tasks} today={clock.today()} canEdit={canDecide} />
        <ThreadView
          thread={thread}
          note={note ?? null}
          today={clock.today()}
          timezone={env.ESTA_TIMEZONE}
          canDecide={canDecide}
          isOperator={member.isOperator}
          proposals={{ details, reminderLabels }}
          topic={topic}
          suggestions={suggestions}
        />
      </ToastHost>
    </div>
  );
}
