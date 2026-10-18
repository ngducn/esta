import { formatDayMonth, type Locale } from '@esta/core/format';
import type { PropertyStatusMark } from '@esta/core/properties';
import type { MarkStatus } from '@/components/status-mark';

export type StatusPillData = { readonly status: MarkStatus; readonly label: string };

type Words = { leased: (counts: { leased: number; total: number }) => string; vacantSince: (values: { date: string }) => string };

/** A leased property borrows the settled `paid` shape, as a certified one does on its legal pill. */
export function statusPills(marks: readonly PropertyStatusMark[], words: Words, locale: Locale): StatusPillData[] {
  return marks.map((mark) =>
    mark.kind === 'leased'
      ? { status: 'paid', label: words.leased({ leased: mark.leased, total: mark.total }) }
      : { status: 'vacant', label: words.vacantSince({ date: formatDayMonth(mark.since, locale) }) },
  );
}
