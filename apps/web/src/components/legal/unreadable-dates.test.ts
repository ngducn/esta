import { isoDate } from '@esta/core/date';
import { describe, expect, it } from 'vitest';
import { dateReading } from '@/components/use-date-field';
import { annotationDraft, readAnnotations } from './annotation-list';
import { mortgageDraft, readMortgage } from './mortgage-fields';
import { purposeDraft, readPurposes } from './purpose-rows';

const unreadable = { value: null, unreadable: true } as const;

describe('legal drafts with a date that is not on the calendar', () => {
  it('refuses a mortgage whose registration date is unreadable, even when released', () => {
    const draft = { ...mortgageDraft(null), bankId: 'bank-1', amountText: '1.000.000', registeredOn: unreadable, releasedOn: dateReading(isoDate('2026-09-30')) };
    expect(readMortgage('valid', draft)).toEqual({ ok: false, invalid: 'date' });
    expect(readMortgage('mortgaged', { ...draft, releasedOn: dateReading(null) })).toEqual({ ok: false, invalid: 'date' });
  });

  it('ignores the hidden release date of a mortgaged certificate', () => {
    const draft = { ...mortgageDraft(null), bankId: 'bank-1', amountText: '1.000.000', releasedOn: unreadable };
    expect(readMortgage('mortgaged', draft)).toEqual({ ok: true, value: { bank_party_id: 'bank-1', amount_vnd: 1_000_000 } });
  });

  it('keeps an empty registration date as no date', () => {
    const draft = { ...mortgageDraft(null), bankId: 'bank-1', amountText: '1.000.000' };
    expect(readMortgage('mortgaged', draft)).toMatchObject({ ok: true });
  });

  it('refuses a purpose term that ends on an unreadable day', () => {
    const draft = { ...purposeDraft(0), code: 'ONT', term: 'until' as const, until: unreadable };
    expect(readPurposes([draft]).ok).toBe(false);
  });

  it('exposes an annotation date as unreadable for the form to refuse', () => {
    const draft = { ...annotationDraft(0), text: 'note', date: unreadable };
    expect(draft.date.unreadable).toBe(true);
    expect(readAnnotations([draft])).toEqual([{ text: 'note' }]);
  });
});
