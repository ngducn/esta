import type { ActivityEvent } from '@esta/core/activity';
import { Archive, ArchiveRestore, FilePen, House, ImageUp, MapPin, MapPinOff, PenLine, Plus, Scale, Shapes, SquareDashed, Tag, Trash2, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

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

export function ActivityList({ entries, title, empty }: { entries: readonly ActivityListEntry[]; title: string; empty: string }) {
  return (
    <section aria-labelledby="activity-title" className="rounded-lg border border-rule bg-surface p-5 shadow-card lg:p-6">
      <h2 id="activity-title" className="mb-2 text-h3 text-ink">
        {title}
      </h2>
      {entries.length === 0 ? (
        <p className="text-body text-ink-muted">{empty}</p>
      ) : (
        <ol data-testid="activity-list" className="flex flex-col">
          {entries.map((entry) => {
            const Icon = eventIcons[entry.event];
            return (
              <li key={entry.id} data-testid="activity-entry" data-event={entry.event} className="flex items-start gap-3 border-t border-rule py-3 first:border-t-0">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2">
                  <Icon className="size-4.5" strokeWidth={2} aria-hidden="true" />
                </span>
                <p className="min-w-0 pt-1.5 text-body break-words text-ink-2">{entry.line}</p>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
