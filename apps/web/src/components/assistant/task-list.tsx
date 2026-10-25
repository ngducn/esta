import type { IsoDate } from '@esta/core/date';
import { formatDate } from '@esta/core/format';
import type { TodayTask } from '@esta/core/today';
import { getLocale, getTranslations } from 'next-intl/server';
import { cn } from '@/lib/utils';
import { TaskDone } from './task-done';

/** `Việc cần làm` at the top of Hộp thư: open tasks by due date, each with `Xong` for a member. */
export async function TaskList({ tasks, today, canEdit }: { tasks: readonly TodayTask[]; today: IsoDate; canEdit: boolean }) {
  const [t, locale] = await Promise.all([getTranslations('assistant'), getLocale()]);
  return (
    <section id="tasks" aria-labelledby="tasks-heading" data-testid="tasks" className="flex max-w-3xl scroll-mt-24 flex-col gap-3">
      <h2 id="tasks-heading" className="text-h3 font-semibold text-ink">
        {t('tasks')}
      </h2>
      {tasks.length === 0 ? (
        <p data-testid="tasks-empty" className="rounded-lg border border-rule bg-surface p-5 text-body text-pretty text-ink-2 shadow-card sm:p-6">
          {t('tasksEmpty')}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-rule rounded-lg border border-rule bg-surface px-5 shadow-card sm:px-6">
          {tasks.map((task) => (
            <li key={task.taskId} data-testid="task" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-4">
              <div className="flex min-w-0 flex-col gap-1">
                <p data-testid="task-title" className="text-body font-medium break-words text-ink">
                  {task.title}
                </p>
                <p className="flex flex-wrap gap-x-3 gap-y-1 text-small text-ink-2">
                  <span className={cn('figures', task.dueOn !== null && task.dueOn <= today && 'font-medium text-ink')}>
                    {task.dueOn === null ? t('taskNoDue') : t('taskDue', { date: formatDate(task.dueOn, locale) })}
                  </span>
                  {task.propertyName === null ? null : <span className="break-words">{task.propertyName}</span>}
                </p>
              </div>
              {canEdit ? (
                <TaskDone
                  id={task.taskId}
                  labels={{ done: t('taskDone'), doneLabel: t('taskDoneLabel', { title: task.title }), toast: t('taskDoneToast'), failed: t('noteFailed'), restoreFailed: t('taskRestoreFailed') }}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
