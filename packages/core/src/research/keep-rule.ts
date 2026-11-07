import { addDays } from '../date/calendar';
import type { IsoDate } from '../date/iso-date';
import type { Result } from '../result';

export type KeepInput = { readonly publishedOn: IsoDate; readonly effectiveOn: IsoDate | null };

declare const windowBrand: unique symbol;

/** The dates one scan keeps news for. Only `scanWindow` builds one, so the prompt and the keep rule read the same dates. */
export type ScanWindow = { readonly today: IsoDate; readonly newSince: IsoDate; readonly effectiveBy: IsoDate; readonly [windowBrand]: true };

export type KeepReason = 'new_since_last_run' | 'effective_soon';
export type DropReason = 'published_in_future' | 'seen_before';

const FIRST_RUN_DAYS = 7;
const EFFECTIVE_WITHIN_DAYS = 60;

/** AGENT.md §5.2: news since the last successful run, or the last 7 days on the first; a rule taking effect within 60 days from today. */
export function scanWindow({ today, lastSuccessOn }: { readonly today: IsoDate; readonly lastSuccessOn: IsoDate | null }): ScanWindow {
  return { today, newSince: lastSuccessOn ?? addDays(today, -FIRST_RUN_DAYS), effectiveBy: addDays(today, EFFECTIVE_WITHIN_DAYS) } as ScanWindow;
}

/**
 * [app rule] Dates compare by day, so news from the day of the last run is kept again and
 * the URL and title dedupe drop it if it was stored.
 */
export function keepRule({ publishedOn, effectiveOn }: KeepInput, { today, newSince, effectiveBy }: ScanWindow): Result<KeepReason, DropReason> {
  if (publishedOn > today) return { ok: false, reason: 'published_in_future' };
  if (publishedOn >= newSince) return { ok: true, value: 'new_since_last_run' };
  if (effectiveOn !== null && effectiveOn >= today && effectiveOn <= effectiveBy) return { ok: true, value: 'effective_soon' };
  return { ok: false, reason: 'seen_before' };
}
