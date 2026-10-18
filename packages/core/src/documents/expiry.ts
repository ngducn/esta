import { daysBetween } from '../date/calendar';
import type { IsoDate } from '../date/iso-date';

/** [app rule] A tile counts down only in the last 30 days, so a policy that runs for years stays quiet. Watch rule W5 uses the same window. */
export const EXPIRY_WINDOW_DAYS = 30;

export type DocumentExpiry = { readonly state: 'none' } | { readonly state: 'expires_in'; readonly days: number } | { readonly state: 'expired' };

/** A document due today still has 0 days left; it reads expired from the next day. */
export function documentExpiry(expiresOn: IsoDate | null, today: IsoDate): DocumentExpiry {
  if (expiresOn === null) return { state: 'none' };
  const days = daysBetween(today, expiresOn);
  if (days < 0) return { state: 'expired' };
  return days <= EXPIRY_WINDOW_DAYS ? { state: 'expires_in', days } : { state: 'none' };
}

export type ExpiringSoon<T> = { readonly document: T; readonly days: number };

/** The documents that expire within the window, soonest first; an expired one has left the list (DOC-7). */
export function expiringSoon<T extends { readonly expiresOn: IsoDate | null }>(documents: readonly T[], today: IsoDate): ExpiringSoon<T>[] {
  return documents
    .flatMap((document) => {
      const expiry = documentExpiry(document.expiresOn, today);
      return expiry.state === 'expires_in' ? [{ document, days: expiry.days }] : [];
    })
    .toSorted((a, b) => a.days - b.days);
}
