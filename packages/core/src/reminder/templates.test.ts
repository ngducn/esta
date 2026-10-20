import { describe, expect, it } from 'vitest';
import { isoDate } from '../date/iso-date';
import { vnd } from '../money/vnd';
import {
  defaultFormOfAddress,
  draftReminder,
  FORM_OF_ADDRESS_KEYS,
  FORMS_OF_ADDRESS,
  REMINDER_TEMPLATES,
  reminderTiming,
  type ReminderInput,
  type ReminderTiming,
} from './templates';

/** SPEC §9.3 on 2026-10-07: Phòng 5's September bill, unpaid and 12 days late. */
const phong5: ReminderInput = {
  timing: { situation: 'overdue', days: 12 },
  form: 'anh_chi',
  tenantName: 'Hoàng Văn Em',
  place: 'Phòng 5, Dãy trọ Dĩ An',
  periodStart: isoDate('2026-09-25'),
  periodEnd: isoDate('2026-10-24'),
  dueDate: isoDate('2026-09-25'),
  amountVnd: vnd(2_800_000),
  qrUrl: 'https://esta.example/q/AbCdEfGhIjKlMnOpQrSt_-',
};

const phong3: ReminderInput = {
  ...phong5,
  timing: { situation: 'due_soon' },
  tenantName: 'Lê Văn Cường',
  place: 'Phòng 3, Dãy trọ Dĩ An',
  periodStart: isoDate('2026-10-25'),
  periodEnd: isoDate('2026-11-24'),
  dueDate: isoDate('2026-10-25'),
  amountVnd: vnd(2_500_000),
};

const NBSP = ' ';

describe('draftReminder', () => {
  it('reminds an overdue tenant by given name, with the period, what is still owed, the days late and the QR link', () => {
    expect(draftReminder(phong5)).toBe(
      [
        'Chào anh/chị Em.',
        `Tiền thuê Phòng 5, Dãy trọ Dĩ An kỳ 25/09/2026 – 24/10/2026 còn 2.800.000${NBSP}₫ chưa thanh toán, đã quá hạn 12 ngày (hạn ngày 25/09/2026).`,
        'Mong anh/chị sắp xếp thanh toán sớm.',
        'Mã QR và thông tin chuyển khoản: https://esta.example/q/AbCdEfGhIjKlMnOpQrSt_-',
        'Nếu anh/chị đã thanh toán rồi, xin bỏ qua tin nhắn này.',
        'Cảm ơn anh/chị.',
      ].join('\n'),
    );
  });

  it('reminds before the due date with the date and no overdue wording', () => {
    const text = draftReminder(phong3);
    expect(text).toBe(
      [
        'Chào anh/chị Cường.',
        `Tiền thuê Phòng 3, Dãy trọ Dĩ An kỳ 25/10/2026 – 24/11/2026 cần thanh toán là 2.500.000${NBSP}₫, hạn ngày 25/10/2026.`,
        'Mã QR và thông tin chuyển khoản: https://esta.example/q/AbCdEfGhIjKlMnOpQrSt_-',
        'Nếu anh/chị đã thanh toán rồi, xin bỏ qua tin nhắn này.',
        'Cảm ơn anh/chị.',
      ].join('\n'),
    );
    expect(text).not.toMatch(/quá hạn|sớm/);
  });

  it('reminds on the due date itself', () => {
    expect(draftReminder({ ...phong3, timing: { situation: 'due_today' } }).split('\n')[1]).toBe(
      `Hôm nay, 25/10/2026, là hạn thanh toán tiền thuê Phòng 3, Dãy trọ Dĩ An kỳ 25/10/2026 – 24/11/2026, số tiền 2.500.000${NBSP}₫.`,
    );
  });

  it('addresses the tenant with the pronoun Mẹ picks, all the way through', () => {
    expect(draftReminder({ ...phong5, form: 'co' })).toBe(
      [
        'Chào cô Em.',
        `Tiền thuê Phòng 5, Dãy trọ Dĩ An kỳ 25/09/2026 – 24/10/2026 còn 2.800.000${NBSP}₫ chưa thanh toán, đã quá hạn 12 ngày (hạn ngày 25/09/2026).`,
        'Mong cô sắp xếp thanh toán sớm.',
        'Mã QR và thông tin chuyển khoản: https://esta.example/q/AbCdEfGhIjKlMnOpQrSt_-',
        'Nếu cô đã thanh toán rồi, xin bỏ qua tin nhắn này.',
        'Cảm ơn cô.',
      ].join('\n'),
    );
    for (const [form, greeting] of [
      ['anh', 'Chào anh Em.'],
      ['chi', 'Chào chị Em.'],
      ['chu', 'Chào chú Em.'],
    ] as const) {
      expect(draftReminder({ ...phong5, form }).split('\n')[0]).toBe(greeting);
    }
  });

  it('greets a business by its full name and calls it Quý khách', () => {
    const text = draftReminder({ ...phong5, form: 'quy_khach', tenantName: ' Công ty TNHH Demo Phát Đạt ', place: 'Nhà phố Q7' });
    expect(text.split('\n')).toEqual([
      'Kính gửi Công ty TNHH Demo Phát Đạt.',
      `Tiền thuê Nhà phố Q7 kỳ 25/09/2026 – 24/10/2026 còn 2.800.000${NBSP}₫ chưa thanh toán, đã quá hạn 12 ngày (hạn ngày 25/09/2026).`,
      'Mong Quý khách sắp xếp thanh toán sớm.',
      'Mã QR và thông tin chuyển khoản: https://esta.example/q/AbCdEfGhIjKlMnOpQrSt_-',
      'Nếu Quý khách đã thanh toán rồi, xin bỏ qua tin nhắn này.',
      'Cảm ơn Quý khách.',
    ]);
  });

  it('leaves the QR line out when the household has no receiving account', () => {
    const text = draftReminder({ ...phong5, qrUrl: null });
    expect(text).not.toContain('Mã QR');
    expect(text.split('\n')).toHaveLength(5);
  });

  it('writes NFC however the name and place were stored', () => {
    const text = draftReminder({ ...phong5, tenantName: 'Đặng Thị Hường'.normalize('NFD'), place: 'Phòng 5, Dãy trọ Dĩ An'.normalize('NFD') });
    expect(text).toBe(text.normalize('NFC'));
    expect(text.startsWith('Chào anh/chị Hường.')).toBe(true);
    expect(text).toContain('Phòng 5, Dãy trọ Dĩ An kỳ');
  });

  const every = (['due_soon', 'due_today', 'overdue'] as const).flatMap((situation) =>
    FORM_OF_ADDRESS_KEYS.map((form) => {
      const timing: ReminderTiming = situation === 'overdue' ? { situation, days: 3 } : { situation };
      return draftReminder({ ...phong5, timing, form });
    }),
  );

  it('never raises its voice: no exclamation mark in any template, form or situation (LSE-11)', () => {
    for (const text of every) expect(text).not.toMatch(/[!！]/);
    const facts = { you: 'anh/chị', place: 'Phòng 1', period: '01/10/2026 – 31/10/2026', amount: '1.000.000 ₫', due: '01/10/2026', days: 1 };
    for (const template of Object.values(REMINDER_TEMPLATES)) for (const line of template(facts)) expect(line).not.toContain('!');
    for (const form of Object.values(FORMS_OF_ADDRESS)) expect(`${form.salutation} ${form.you}`).not.toContain('!');
  });

  it('is Vietnamese only: no English word leaks into any draft', () => {
    const english = /\b(dear|hello|hi|rent|due|overdue|days?|paid|pay(ment)?|please|thanks?|thank you|period|amount|room|qr code|transfer)\b/i;
    for (const text of every) {
      expect(text.replace(/https:\/\/\S+/g, '')).not.toMatch(english);
      expect(text).toBe(text.normalize('NFC'));
    }
  });
});

describe('reminderTiming', () => {
  it('maps the board state of a still-owed bill to the situation it is reminded in', () => {
    expect(reminderTiming({ group: 'overdue', days: 12 })).toEqual({ situation: 'overdue', days: 12 });
    expect(reminderTiming({ group: 'due' })).toEqual({ situation: 'due_today' });
    expect(reminderTiming({ group: 'notDue' })).toEqual({ situation: 'due_soon' });
    expect(reminderTiming({ group: 'paid' })).toBeNull();
  });
});

describe('defaultFormOfAddress', () => {
  it('greets a person as anh/chị and a business as Quý khách until Mẹ picks', () => {
    expect(defaultFormOfAddress('individual')).toBe('anh_chi');
    expect(defaultFormOfAddress('organization')).toBe('quy_khach');
  });
});
