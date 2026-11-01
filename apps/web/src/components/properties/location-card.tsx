import { MapPinOff, MapPinPen, MapPinPlus } from 'lucide-react';
import { LocationMap, type LocationMapProps } from '@/components/map/location-map';
import { IntentLink } from '@/components/shell/intent-link';
import { buttonVariants } from '@/components/ui/button-variants';

export type LocationCardLabels = { title: string; edit: string; set: string; none: string; noneBody: string };

/** `id="location"` lets a link land on the card. `locateHref` is null for a member who cannot set the location. */
export function LocationCard({ map, locateHref, labels }: { map: LocationMapProps | null; locateHref: string | null; labels: LocationCardLabels }) {
  return (
    <section id="location" aria-labelledby="location-title" data-testid="location-card" className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5 shadow-xs lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="location-title" className="text-title-3 text-text">
          {labels.title}
        </h2>
        {map === null || locateHref === null ? null : (
          <IntentLink href={locateHref} className={buttonVariants({ variant: 'secondary' })}>
            <MapPinPen aria-hidden="true" />
            {labels.edit}
          </IntentLink>
        )}
      </div>
      {map === null ? (
        <div className="flex flex-col items-start gap-3">
          <p className="flex items-center gap-2 text-body font-medium text-text">
            <MapPinOff className="size-5 shrink-0 text-text-muted" strokeWidth={1.9} aria-hidden="true" />
            {labels.none}
          </p>
          <p className="max-w-prose text-body text-text-secondary">{labels.noneBody}</p>
          {locateHref === null ? null : (
            <IntentLink href={locateHref} className={buttonVariants({ variant: 'primary' })}>
              <MapPinPlus aria-hidden="true" />
              {labels.set}
            </IntentLink>
          )}
        </div>
      ) : (
        <LocationMap {...map} />
      )}
    </section>
  );
}
