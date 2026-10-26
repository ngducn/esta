import { ChevronDown, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { Pinned } from '@/server/agent/items';
import { PinnedFold } from './pinned-fold';

/**
 * `Cần xử lý` above the thread: the open work Trợ lý left, so a new day's messages never bury it. Each row opens its
 * note, in place when this page holds it and through `?note=` when it is further back.
 */
export async function PinnedItems({ pinned, loaded }: { pinned: Pinned; loaded: ReadonlySet<string> }) {
  if (pinned.count === 0) return null;
  const t = await getTranslations('assistant');
  const more = pinned.count - pinned.shown.length;
  return (
    <PinnedFold
      summary={
        <summary className="flex min-h-touch cursor-pointer list-none items-center gap-3 px-5 py-2 sm:px-6 [&::-webkit-details-marker]:hidden">
          <h2 id="pinned-heading" className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 text-h3 font-semibold text-ink">
            {t('pinned')}
            <span data-testid="pinned-count" className="text-small font-medium text-ink-muted figures">
              {t('pinnedCount', { count: pinned.count })}
            </span>
          </h2>
          <ChevronDown aria-hidden="true" className="size-5 shrink-0 text-ink-muted transition-transform duration-(--duration-fast) ease-standard group-open:rotate-180" />
        </summary>
      }
    >
      <div className="flex flex-col border-t border-rule px-5 sm:px-6">
        <ol className="flex flex-col divide-y divide-rule">
          {pinned.shown.map((note) => (
            <li key={note.id} data-testid="pinned-item">
              <Link href={loaded.has(note.id) ? `#note-${note.id}` : `/assistant?note=${note.id}`} className="flex min-h-touch items-center gap-3 py-3 text-ink">
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  {note.proposal ? <span className="text-small text-ink-muted">{t('pinnedProposal')}</span> : null}
                  <span data-testid="pinned-title" className="line-clamp-2 text-body font-medium break-words underline-offset-4 hover:underline">
                    {note.title}
                  </span>
                </span>
                <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-ink-muted" />
              </Link>
            </li>
          ))}
        </ol>
        {more > 0 ? <p className="border-t border-rule py-3 text-small text-ink-2">{t('pinnedMore', { count: more })}</p> : null}
      </div>
    </PinnedFold>
  );
}
