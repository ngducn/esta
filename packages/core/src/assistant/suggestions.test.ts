import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAX_SUGGESTIONS, noteSuggestion, SUGGESTION_PARAMS, SUGGESTION_WINDOW, SUGGESTIONS, suggestionCandidates, suggestReplies, type SuggestionNote } from './suggestions';
import { noteRelated } from './topic';

const watchNote = (id: string, ruleId: string, fields: Partial<SuggestionNote> = {}): SuggestionNote => ({
  id,
  kind: 'alert',
  severity: 'action',
  status: 'new',
  stamp: '2026-10-07T06:45:00+07:00',
  related: noteRelated({ facts: [{ rule_id: ruleId, subject_key: `lease:${id}` }], links: [] }),
  labels: { tenant: 'Hoàng Văn Em Demo', property: 'Căn hộ Thủ Đức', unit: 'Phòng 8 Dãy trọ Dĩ An' },
  ...fields,
});

const texts = (notes: readonly SuggestionNote[]) => suggestReplies(notes).map(({ noteId, key, params }) => [noteId, key, params]);

describe('suggested replies (AGENT.md §5.6 step 8)', () => {
  it.each([
    ['W1', [['w', 'remindTenant', { tenant: 'Hoàng Văn Em Demo' }], ['w', 'tenantLateCount', { tenant: 'Hoàng Văn Em Demo' }]]],
    ['W3', [['w', 'renewLease', { property: 'Căn hộ Thủ Đức' }]]],
    ['W4', [['w', 'rentFaster', { unit: 'Phòng 8 Dãy trọ Dĩ An' }]]],
  ])('maps watch rule %s to its replies, naming record labels', (rule, expected) => {
    expect(texts([watchNote('w', rule)])).toEqual(expected);
  });

  it('maps the brief and the weekly review by kind, with no label', () => {
    expect(texts([watchNote('b', 'W1', { kind: 'brief', severity: 'info', labels: {} })])).toEqual([['b', 'briefFirst', {}]]);
    expect(texts([watchNote('k', 'W1', { kind: 'weekly', severity: 'info', labels: {} })])).toEqual([['k', 'weeklySummary', {}]]);
  });

  it('suggests nothing for a rule with no replies, a proposal or an operator note kind', () => {
    expect(texts([watchNote('a', 'W5'), watchNote('b', 'W1', { kind: 'proposal' }), watchNote('c', 'W1', { kind: 'system' })])).toEqual([]);
  });

  it('names the first fact of a grouped note whose rule has replies', () => {
    const digest = noteRelated({ facts: [{ rule_id: 'W5', subject_key: 'document:d' }, { rule_id: 'W4', subject_key: 'unit:u' }], links: [] });
    expect(noteSuggestion('alert', digest)).toEqual({ keys: SUGGESTIONS.W4, subjectKey: 'unit:u' });
  });

  it('offers at most three, from the most severe note first and then the newest', () => {
    const notes = [
      watchNote('watch', 'W4', { severity: 'watch', stamp: '2026-10-07T06:45:40+07:00' }),
      watchNote('older', 'W3', { stamp: '2026-10-07T06:45:20+07:00' }),
      watchNote('newer', 'W1', { stamp: '2026-10-07T06:45:30+07:00' }),
      watchNote('brief', 'W1', { kind: 'brief', severity: 'info', stamp: '2026-10-07T07:00:00+07:00' }),
    ];
    expect(suggestReplies(notes)).toHaveLength(MAX_SUGGESTIONS);
    expect(texts(notes).map(([id, key]) => `${id} ${key}`)).toEqual(['newer remindTenant', 'newer tenantLateCount', 'older renewLease']);
  });

  it('offers the same replies whatever order the notes were read in, when two share severity and instant', () => {
    const first = watchNote('0001', 'W3');
    const second = watchNote('0002', 'W4');
    const expected = [['0002', 'rentFaster', { unit: 'Phòng 8 Dãy trọ Dĩ An' }], ['0001', 'renewLease', { property: 'Căn hộ Thủ Đức' }]];
    expect(texts([first, second])).toEqual(expected);
    expect(texts([second, first])).toEqual(expected);
  });

  it('reads the labels of the first notes that can offer a reply, past the third when earlier ones repeat or lack a label', () => {
    const notes = Array.from({ length: SUGGESTION_WINDOW + 4 }, (_, i) => watchNote(`w${String(i).padStart(2, '0')}`, 'W1', { stamp: `2026-10-07T06:45:${String(59 - i).padStart(2, '0')}+07:00` }));
    const settled = watchNote('settled', 'W1', { status: 'dismissed', stamp: '2026-10-07T23:00:00+07:00' });
    const silent = watchNote('silent', 'W5', { stamp: '2026-10-07T22:00:00+07:00' });
    const chosen = suggestionCandidates([silent, ...notes.toReversed(), settled]);
    expect(chosen.map(({ id }) => id)).toEqual(notes.slice(0, SUGGESTION_WINDOW).map(({ id }) => id));
    expect(SUGGESTION_WINDOW).toBeGreaterThan(MAX_SUGGESTIONS);
  });

  it('still fills the third reply from a later note when a tenant’s late invoices each wrote a note', () => {
    const tenantLate = ['a', 'b', 'c'].map((id, i) => watchNote(id, 'W1', { stamp: `2026-10-07T06:45:${30 - i}+07:00` }));
    const renewal = watchNote('d', 'W3', { stamp: '2026-10-07T06:45:10+07:00' });
    expect(texts(suggestionCandidates([...tenantLate, renewal])).map(([id, key]) => `${id} ${key}`)).toEqual(['a remindTenant', 'a tenantLateCount', 'd renewLease']);
  });

  it('a hidden or settled note gives no reply', () => {
    expect(texts([watchNote('w', 'W1', { status: 'dismissed' }), watchNote('d', 'W3', { status: 'done' })])).toEqual([]);
    expect(texts([watchNote('w', 'W1', { status: 'read' })])).toHaveLength(2);
  });

  it('leaves out a reply whose label the records do not hold, and one already offered by an older note', () => {
    expect(texts([watchNote('w', 'W1', { labels: { property: 'Dãy trọ Dĩ An' } })])).toEqual([]);
    const today = watchNote('today', 'W1', { stamp: '2026-10-07T06:45:30+07:00' });
    const yesterday = watchNote('yesterday', 'W1', { stamp: '2026-10-06T06:45:30+07:00' });
    expect(texts([yesterday, today]).map(([id]) => id)).toEqual(['today', 'today']);
  });

  it('has every reply in vi.json and en.json, with the labels it names as arguments', () => {
    for (const locale of ['vi', 'en']) {
      const messages = JSON.parse(readFileSync(join(import.meta.dirname, `../../../../apps/web/messages/${locale}.json`), 'utf8')) as { assistant: { suggestions: Record<string, string> } };
      for (const [key, params] of Object.entries(SUGGESTION_PARAMS)) {
        const text = messages.assistant.suggestions[key];
        expect(text, `${locale} ${key}`).toBeTypeOf('string');
        expect([...(text ?? '').matchAll(/\{(\w+)\}/g)].map(([, name]) => name).toSorted(), `${locale} ${key}`).toEqual([...params].toSorted());
      }
      expect(Object.keys(messages.assistant.suggestions).toSorted()).toEqual(Object.keys(SUGGESTION_PARAMS).toSorted());
    }
  });
});
