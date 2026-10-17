import { ChevronRight, Plus } from 'lucide-react';
import { CompletenessRingView } from '@/components/completeness-ring';
import { IntentLink } from '@/components/shell/intent-link';

/** The header's completeness block, already translated. `href` is `null` for a viewer, who cannot open the forms. */
export type MissingItemsData = {
  title: string;
  percent: number;
  score: string;
  /** `Đã đủ thông tin` when nothing is missing, else `null`. */
  complete: string | null;
  listLabel: string;
  items: readonly { id: string; label: string; href: string | null }[];
};

/** The score and the next items to fill in, each a link that lands on its field. */
export function MissingItems({ data }: { data: MissingItemsData }) {
  return (
    <section aria-label={data.title} data-testid="property-completeness" className="flex flex-col gap-2 rounded-md bg-surface-2 p-4">
      <p className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <span className="text-body font-semibold text-ink">{data.title}</span>
        <CompletenessRingView percent={data.percent} label={data.score} />
      </p>
      {data.complete === null ? (
        <ul aria-label={data.listLabel} data-testid="missing-items" className="-mx-2 flex flex-col">
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
      ) : (
        <p data-testid="completeness-complete" className="text-body text-ink-2">
          {data.complete}
        </p>
      )}
    </section>
  );
}
