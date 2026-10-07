import type { IsoDate } from '../date/iso-date';

/** A moment in UTC, always in the canonical `YYYY-MM-DDTHH:mm:ss.sssZ` form. */
export type Instant = string & { readonly __brand: 'Instant' };

export type ClockSourceKind = 'table' | 'env' | 'system';

export type ClockSource = { readonly kind: ClockSourceKind; readonly now: Instant };

export type Clock = {
  readonly source: ClockSourceKind;
  now(): Instant;
  today(): IsoDate;
};
