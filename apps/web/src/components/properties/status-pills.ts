import { formatDayMonth, formatMonthWithin, type Locale } from '@esta/core/format';
import type { PropertyStatusMark } from '@esta/core/properties';
import type { MarkStatus } from '@/components/status-shape';

export type StatusPillData = { readonly status: MarkStatus; readonly label: string };

type Words = {
  leased: (counts: { leased: number; total: number }) => string;
  vacantSince: (values: { date: string }) => string;
  paymentOverdue: (values: { days: number }) => string;
  paymentDue: () => string;
  paymentPaid: (values: { month: string }) => string;
};

/** A leased property borrows the settled `paid` shape, as a certified one does on its legal pill. */
function pill(mark: PropertyStatusMark, words: Words, locale: Locale): StatusPillData {
  switch (mark.kind) {
    case 'overdue':
      return { status: 'overdue', label: words.paymentOverdue({ days: mark.days }) };
    case 'due':
      return { status: 'due', label: words.paymentDue() };
    case 'paid':
      return { status: 'paid', label: words.paymentPaid({ month: formatMonthWithin(mark.month, mark.month, locale) }) };
    case 'leased':
      return { status: 'paid', label: words.leased({ leased: mark.leased, total: mark.total }) };
    case 'vacant':
      return { status: 'vacant', label: words.vacantSince({ date: formatDayMonth(mark.since, locale) }) };
  }
}

export function statusPills(marks: readonly PropertyStatusMark[], words: Words, locale: Locale): StatusPillData[] {
  return marks.map((mark) => pill(mark, words, locale));
}

export function statusWords(t: (key: 'leased' | 'vacantSince' | 'paymentOverdue' | 'paymentDue' | 'paymentPaid', values?: Record<string, string | number>) => string): Words {
  return {
    leased: (values) => t('leased', values),
    vacantSince: (values) => t('vacantSince', values),
    paymentOverdue: (values) => t('paymentOverdue', values),
    paymentDue: () => t('paymentDue'),
    paymentPaid: (values) => t('paymentPaid', values),
  };
}
