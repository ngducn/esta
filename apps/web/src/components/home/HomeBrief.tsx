import type { WallClockStamp } from '@esta/core/agent';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { AssistantMonogram } from '@/components/assistant/monogram';
import { stampLabel } from '@/components/assistant/worker-status-line';
import { buttonVariants } from '@/components/ui/button-variants';
import { cn } from '@/lib/utils';

/** Today's brief as one line under the day's list, signed by Trợ lý with when it last ran; a note, never a chat bubble (DESIGN-BRIEF §5.5). */
export async function HomeBrief({ summary, lastRun }: { summary: string | null; lastRun: WallClockStamp | null }) {
  const [t, assistant] = await Promise.all([getTranslations('home'), getTranslations('assistant')]);
  return (
    <section aria-labelledby="home-brief-title" data-testid="home-brief" className="flex flex-col gap-3 rounded-lg border border-rule bg-surface p-5 shadow-card sm:p-6">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <AssistantMonogram />
        <h2 id="home-brief-title" className="text-body font-semibold text-ink">
          {assistant('briefLabel')}
        </h2>
        {lastRun === null ? null : (
          <p data-testid="home-brief-ran" className="text-small text-ink-muted figures">
            {assistant('ranAt', { time: stampLabel(lastRun) })}
          </p>
        )}
      </header>
      <p data-testid={summary === null ? 'home-brief-empty' : 'home-brief-summary'} className={cn('text-body text-pretty break-words', summary === null ? 'text-ink-2' : 'text-ink')}>
        {summary ?? t('briefNone')}
      </p>
      <Link href="/assistant" data-testid="home-brief-open" className={cn(buttonVariants({ variant: 'quiet' }), 'self-start px-0')}>
        {t('briefOpen')}
      </Link>
    </section>
  );
}
