import type { LegalStatus, PropertyKind, UseMode } from '@esta/core/properties';
import { kindIcons } from './kind-icons';
import { LegalPill, UsePill } from './property-pills';

export type OverviewFact = { readonly key: string; readonly label: string; readonly value: string };

export type OverviewFactsData = {
  title: string;
  kind: PropertyKind;
  kindTerm: string;
  kindLabel: string;
  details: readonly OverviewFact[];
  useTerm: string;
  useMode: UseMode;
  useLabel: string;
  legalTerm: string;
  legalStatus: LegalStatus;
  legalLabel: string;
};

const row = 'grid gap-1 border-t border-rule py-3 first:border-t-0 first:pt-0 last:pb-0 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-center sm:gap-4';
const term = 'text-small text-ink-muted';

export function OverviewFacts({ facts }: { facts: OverviewFactsData }) {
  const KindIcon = kindIcons[facts.kind];
  return (
    <section aria-labelledby="overview-facts" className="rounded-lg border border-rule bg-surface p-5 shadow-card lg:p-6">
      <h2 id="overview-facts" className="mb-4 text-h3 text-ink">
        {facts.title}
      </h2>
      <dl data-testid="overview-facts">
        <div className={row}>
          <dt className={term}>{facts.kindTerm}</dt>
          <dd className="flex items-center gap-2 text-body font-semibold text-ink">
            <KindIcon className="size-5 shrink-0 text-ink-muted" strokeWidth={1.9} aria-hidden="true" />
            {facts.kindLabel}
          </dd>
        </div>
        {facts.details.map((detail) => (
          <div key={detail.key} data-detail={detail.key} className={row}>
            <dt className={term}>{detail.label}</dt>
            <dd className="figures text-body break-words text-ink">{detail.value}</dd>
          </div>
        ))}
        <div className={row}>
          <dt className={term}>{facts.useTerm}</dt>
          <dd>
            <UsePill useMode={facts.useMode} label={facts.useLabel} />
          </dd>
        </div>
        <div className={row}>
          <dt className={term}>{facts.legalTerm}</dt>
          <dd>
            <LegalPill legalStatus={facts.legalStatus} label={facts.legalLabel} />
          </dd>
        </div>
      </dl>
    </section>
  );
}
