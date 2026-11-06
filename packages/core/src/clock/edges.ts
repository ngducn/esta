import type { IsoDate } from '../date/iso-date';
import type { Instant } from './clock';
import { parseInstant } from './resolve';

export type ClockEdge = { readonly name: string; readonly now: Instant; readonly businessDate: IsoDate };

const edge = (name: string, now: string, businessDate: string): ClockEdge => ({ name, now: parseInstant(now), businessDate: businessDate as IsoDate });

/**
 * The instants a logic keyed by a day, a week or a month must be tried at (Q-16): a minute either side of local
 * midnight, Sunday into Monday, the end of a month, and the frozen test clock the integration lane runs at. Every
 * instant is in Asia/Ho_Chi_Minh (+07), where the UTC date is the day before the business date until 07:00.
 */
export const clockEdges = (): readonly ClockEdge[] => [
  edge('23:59 on a Wednesday', '2026-10-07T23:59:00+07:00', '2026-10-07'),
  edge('00:01 on the next Thursday', '2026-10-08T00:01:00+07:00', '2026-10-08'),
  edge('Sunday 23:59', '2026-10-11T23:59:00+07:00', '2026-10-11'),
  edge('Monday 00:01', '2026-10-12T00:01:00+07:00', '2026-10-12'),
  edge('month end 23:59', '2026-10-31T23:59:00+07:00', '2026-10-31'),
  edge('first of the month 00:01', '2026-11-01T00:01:00+07:00', '2026-11-01'),
  edge('the frozen test clock', '2026-10-07T09:00:00+07:00', '2026-10-07'),
];
