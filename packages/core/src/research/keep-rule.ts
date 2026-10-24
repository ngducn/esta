import { addDays, daysBetween } from '../date/calendar';
import type { IsoDate } from '../date/iso-date';
import type { Result } from '../result';

export type KeepInput = { readonly publishedOn: IsoDate; readonly effectiveOn: IsoDate | null };

/** `lastSuccessOn` is the business date of the household's last research_scan that finished, or null before the first. */
export type KeepContext = { readonly today: IsoDate; readonly lastSuccessOn: IsoDate | null };

export type KeepReason = 'new_since_last_run' | 'effective_soon';
export type DropReason = 'published_in_future' | 'seen_before';

const FIRST_RUN_DAYS = 7;
const EFFECTIVE_WITHIN_DAYS = 60;

/**
 * AGENT.md §5.2: keep news published since the last successful run (the last 7 days on the first run), or a rule that
 * takes effect within 60 days. [app rule] Dates compare by day, so news from the day of the last run is kept again and
 * the URL and title dedupe drop it if it was stored; "within 60 days" counts from today forward.
 */
export function keepRule({ publishedOn, effectiveOn }: KeepInput, { today, lastSuccessOn }: KeepContext): Result<KeepReason, DropReason> {
  if (publishedOn > today) return { ok: false, reason: 'published_in_future' };
  if (publishedOn >= (lastSuccessOn ?? addDays(today, -FIRST_RUN_DAYS))) return { ok: true, value: 'new_since_last_run' };
  if (effectiveOn !== null && effectiveOn >= today && daysBetween(today, effectiveOn) <= EFFECTIVE_WITHIN_DAYS) return { ok: true, value: 'effective_soon' };
  return { ok: false, reason: 'seen_before' };
}
