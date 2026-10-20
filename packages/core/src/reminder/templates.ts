import type { CollectionState } from '../collections/group';
import type { IsoDate } from '../date/iso-date';
import { formatDate, formatDateRange, formatVnd } from '../format';
import type { Vnd } from '../money/vnd';
import { givenName } from '../names';

/** Where a still-owed bill stands when Mẹ reminds the tenant: the board's groups other than Đã thu (LSE-10). */
export type ReminderTiming = { readonly situation: 'due_soon' } | { readonly situation: 'due_today' } | { readonly situation: 'overdue'; readonly days: number };

export type ReminderSituation = ReminderTiming['situation'];

export function reminderTiming(state: CollectionState): ReminderTiming | null {
  switch (state.group) {
    case 'overdue':
      return { situation: 'overdue', days: state.days };
    case 'due':
      return { situation: 'due_today' };
    case 'notDue':
      return { situation: 'due_soon' };
    case 'paid':
      return null;
  }
}

/**
 * DOMAIN-VN §9 `[app rule]`: how a reminder greets and then addresses the tenant. A person is greeted by given name
 * with the pronoun Mẹ picks, `anh/chị` when she has not; a business by its full name as `Quý khách`.
 */
export const FORM_OF_ADDRESS_KEYS = ['anh_chi', 'anh', 'chi', 'co', 'chu', 'quy_khach'] as const;

export type FormOfAddress = (typeof FORM_OF_ADDRESS_KEYS)[number];

export const FORMS_OF_ADDRESS: Record<FormOfAddress, { readonly salutation: string; readonly you: string; readonly name: 'given' | 'full' }> = {
  anh_chi: { salutation: 'Chào anh/chị', you: 'anh/chị', name: 'given' },
  anh: { salutation: 'Chào anh', you: 'anh', name: 'given' },
  chi: { salutation: 'Chào chị', you: 'chị', name: 'given' },
  co: { salutation: 'Chào cô', you: 'cô', name: 'given' },
  chu: { salutation: 'Chào chú', you: 'chú', name: 'given' },
  quy_khach: { salutation: 'Kính gửi', you: 'Quý khách', name: 'full' },
};

export function defaultFormOfAddress(kind: 'individual' | 'organization'): FormOfAddress {
  return kind === 'organization' ? 'quy_khach' : 'anh_chi';
}

type ReminderFacts = { readonly you: string; readonly place: string; readonly period: string; readonly amount: string; readonly due: string; readonly days: number };

/**
 * LSE-11: what each situation says between the greeting and the shared close. Polite and neutral: no exclamation
 * mark, and no sentence opens on a pronoun, so every form of address reads the same way.
 */
export const REMINDER_TEMPLATES: Record<ReminderSituation, (facts: ReminderFacts) => readonly string[]> = {
  due_soon: (f) => [`Tiền thuê ${f.place} kỳ ${f.period} cần thanh toán là ${f.amount}, hạn ngày ${f.due}.`],
  due_today: (f) => [`Hôm nay, ${f.due}, là hạn thanh toán tiền thuê ${f.place} kỳ ${f.period}, số tiền ${f.amount}.`],
  overdue: (f) => [
    `Tiền thuê ${f.place} kỳ ${f.period} còn ${f.amount} chưa thanh toán, đã quá hạn ${f.days} ngày (hạn ngày ${f.due}).`,
    `Mong ${f.you} sắp xếp thanh toán sớm.`,
  ],
};

export type ReminderInput = {
  readonly timing: ReminderTiming;
  readonly form: FormOfAddress;
  readonly tenantName: string;
  /** `Phòng 5, Dãy trọ Dĩ An`, or the property alone for a whole unit, as the receipt names it. */
  readonly place: string;
  readonly periodStart: IsoDate;
  readonly periodEnd: IsoDate;
  readonly dueDate: IsoDate;
  /** What the bill still owes. */
  readonly amountVnd: Vnd;
  /** The bill's QR picture (`/q/<token>`), absent when the household has no receiving account. */
  readonly qrUrl: string | null;
};

/**
 * LSE-11: the reminder Mẹ copies into Zalo. It is Vietnamese whatever the screen's language, because the tenant reads
 * it, with money and dates as DOMAIN-VN §9 writes them, one sentence a line, in NFC.
 */
export function draftReminder(input: ReminderInput): string {
  const form = FORMS_OF_ADDRESS[input.form];
  const name = form.name === 'given' ? givenName(input.tenantName) : input.tenantName.trim();
  const facts: ReminderFacts = {
    you: form.you,
    place: input.place,
    period: formatDateRange(input.periodStart, input.periodEnd, 'vi'),
    amount: formatVnd(input.amountVnd, 'vi'),
    due: formatDate(input.dueDate, 'vi'),
    days: input.timing.situation === 'overdue' ? input.timing.days : 0,
  };
  return [
    `${form.salutation} ${name}.`,
    ...REMINDER_TEMPLATES[input.timing.situation](facts),
    ...(input.qrUrl === null ? [] : [`Mã QR và thông tin chuyển khoản: ${input.qrUrl}`]),
    `Nếu ${form.you} đã thanh toán rồi, xin bỏ qua tin nhắn này.`,
    `Cảm ơn ${form.you}.`,
  ]
    .join('\n')
    .normalize('NFC');
}
