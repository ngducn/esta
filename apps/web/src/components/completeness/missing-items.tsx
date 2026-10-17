import { ChevronRight, Plus } from 'lucide-react';
import { IntentLink } from '@/components/shell/intent-link';

/** The overview's list of what to add next, already translated. `href` is `null` for a viewer, who cannot open the forms. */
export type MissingItemsData = {
  listLabel: string;
  /** `Đã đủ thông tin` when nothing is missing, else `null`. */
  complete: string | null;
  items: readonly { id: string; label: string; href: string | null }[];
};

export function MissingItems({ data }: { data: MissingItemsData }) {
  return (
    <section aria-label={data.listLabel} className="flex flex-col gap-2 rounded-md bg-surface-2 p-4">
      {data.complete === null ? (
        <>
          <h2 className="text-body font-semibold text-ink">{data.listLabel}</h2>
          <ul data-testid="missing-items" className="-mx-2 flex flex-col">
            {data.items.map((item) => (
              <li key={item.id} data-check={item.id}>
                {item.href === null ? (
                  <p className="flex min-h-touch items-center gap-2 px-2 text-body text-ink-2">{item.label}</p>
                ) : (
                  <IntentLink
                    href={item.href}
                    className="flex min-h-touch items-center gap-2 rounded-sm px-2 text-body font-semibold text-ink hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    <Plus className="size-5 shrink-0 text-accent" strokeWidth={2} aria-hidden="true" />
                    <span className="min-w-0 flex-1 break-words">{item.label}</span>
                    <ChevronRight className="size-5 shrink-0 text-ink-muted" strokeWidth={2} aria-hidden="true" />
                  </IntentLink>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p data-testid="completeness-complete" className="text-body text-ink-2">
          {data.complete}
        </p>
      )}
    </section>
  );
}
