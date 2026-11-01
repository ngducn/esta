import { ChevronDown, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { Pinned } from '@/server/agent/items';
import { PinnedFold } from './pinned-fold';

export async function PinnedItems({ pinned, loaded }: { pinned: Pinned; loaded: ReadonlySet<string> }) {
  if (pinned.count === 0) return null;
  const t = await getTranslations('assistant');
  return (
    <PinnedFold
      summary={
        <summary className="flex min-h-touch cursor-pointer list-none items-center gap-3 px-5 py-2 sm:px-6 [&::-webkit-details-marker]:hidden">
          <h2 id="pinned-heading" className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 text-title-3 font-semibold text-text">
            {t('pinned')}
            <span data-testid="pinned-count" className="text-body-sm font-medium text-text-muted num">
              {t('pinnedCount', { count: pinned.count })}
            </span>
          </h2>
          <ChevronDown aria-hidden="true" className="size-5 shrink-0 text-text-muted transition-transform duration-(--duration-fast) ease-standard group-open:rotate-180" />
        </summary>
      }
    >
      <ol className="flex flex-col divide-y divide-border border-t border-border px-5 sm:px-6">
        {pinned.shown.map((note) => (
          <li key={note.id} data-testid="pinned-item">
            <Link href={loaded.has(note.id) ? `#note-${note.id}` : `/assistant?note=${note.id}`} className="flex min-h-touch items-center gap-3 py-1 text-body text-text">
              <span className="min-w-0 flex-1 truncate">
                {note.proposal ? <span className="text-text-muted">{t('pinnedProposal')} </span> : null}
                <span data-testid="pinned-title" className="font-medium underline-offset-4 hover:underline">
                  {note.title}
                </span>
              </span>
              <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-text-muted" />
            </Link>
          </li>
        ))}
      </ol>
    </PinnedFold>
  );
}
