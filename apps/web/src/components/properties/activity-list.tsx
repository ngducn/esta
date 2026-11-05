import type { ActivityEvent } from '@esta/core/activity';
import { Archive, History, ArchiveRestore, FilePen, House, ImageUp, MapPin, MapPinOff, PenLine, Plus, Scale, Shapes, SquareDashed, Tag, Trash2, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { EmptyState } from '@/components/empty-state';

const eventIcons = {
  created: Plus,
  deleted: Trash2,
  updated: FilePen,
  renamed: PenLine,
  location: MapPin,
  locationCleared: MapPinOff,
  boundary: SquareDashed,
  boundaryCleared: SquareDashed,
  address: House,
  certificateAddress: House,
  photo: ImageUp,
  kind: Shapes,
  kindDetails: Shapes,
  useMode: Tag,
  legalStatus: Scale,
  archived: Archive,
  restored: ArchiveRestore,
} as const satisfies Record<ActivityEvent, LucideIcon>;

export type ActivityListEntry = { readonly id: number; readonly event: ActivityEvent; readonly line: ReactNode };

export function ActivityList({ entries, title, empty, emptyBody }: { entries: readonly ActivityListEntry[]; title: string; empty: string; emptyBody: string }) {
  if (entries.length === 0) return <EmptyState icon={History} title={empty} body={emptyBody} />;
  return (
    <section aria-labelledby="activity-title" className="rounded-lg border border-border bg-surface p-5 shadow-xs lg:p-6">
      <h2 id="activity-title" className="mb-2 text-title-3 text-text">
        {title}
      </h2>
      <ol data-testid="activity-list" className="flex flex-col">
        {entries.map((entry) => {
          const Icon = eventIcons[entry.event];
          return (
            <li key={entry.id} data-testid="activity-entry" data-event={entry.event} className="flex items-start gap-3 border-t border-border py-3 first:border-t-0">
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-bg-subtle text-text-secondary">
                <Icon className="size-4.5" strokeWidth={2} aria-hidden="true" />
              </span>
              <p className="min-w-0 pt-1.5 text-body break-words text-text-secondary">{entry.line}</p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
