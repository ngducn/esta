import { describe, expect, it } from 'vitest';
import { byPriority, isOpenNote, OPEN_NOTE_STATUSES, type RankedNote } from './open-notes';
import { noteRelated, noteRelatedOf } from './topic';

const ranked = (id: string, severity: RankedNote['severity'], stamp: string): RankedNote => ({ id, severity, stamp });

describe('which notes are open', () => {
  it.each([
    ['new', true],
    ['read', true],
    ['dismissed', false],
    ['approved', false],
    ['failed', false],
    ['done', false],
    ['', false],
  ])('%s is open: %s', (status, open) => {
    expect(isOpenNote(status)).toBe(open);
  });

  it('is the list a query filters by and the check a screen asks, so the two never differ', () => {
    expect(OPEN_NOTE_STATUSES.every(isOpenNote)).toBe(true);
    expect(OPEN_NOTE_STATUSES).toEqual(['new', 'read']);
  });
});

describe('the order open notes lead in', () => {
  it('puts the most severe first, then the newest', () => {
    const notes = [ranked('b', 'info', '2026-10-07T08:00:00.000000Z'), ranked('a', 'watch', '2026-10-07T06:00:00.000000Z'), ranked('c', 'action', '2026-10-06T06:00:00.000000Z'), ranked('d', 'action', '2026-10-07T06:00:00.000000Z')];
    expect(notes.toSorted(byPriority).map(({ id }) => id)).toEqual(['d', 'c', 'a', 'b']);
  });

  it('breaks a tie of severity and instant by id, so the same notes lead whatever order they were read in', () => {
    const one = ranked('0001', 'action', '2026-10-07T06:45:00.000000Z');
    const two = ranked('0002', 'action', '2026-10-07T06:45:00.000000Z');
    expect([one, two].toSorted(byPriority)).toEqual([two, one]);
    expect([two, one].toSorted(byPriority)).toEqual([two, one]);
    expect(byPriority(one, { ...one })).toBe(0);
  });
});

describe('what a note stores as related', () => {
  it('keeps the facts it tells and the links it was given, which need not be its facts’ own', () => {
    const related = noteRelatedOf(
      [
        { ruleId: 'W1', subjectKey: 'invoice:a' },
        { ruleId: 'W4', subjectKey: 'unit:b' },
      ],
      ['esta://invoice/a'],
    );
    expect(related).toEqual({
      facts: [
        { rule_id: 'W1', subject_key: 'invoice:a' },
        { rule_id: 'W4', subject_key: 'unit:b' },
      ],
      links: ['esta://invoice/a'],
    });
    expect(noteRelated(related)).toEqual(related);
  });

  it.each([null, 'text', 7, [], {}, { links: 'esta://a', facts: 3 }, { links: ['esta://a', 5] }])('reads %j as a note with no facts and no links, never as an error', (stored) => {
    expect(noteRelated(stored)).toEqual({ facts: [], links: [] });
  });

  it('keeps the links of a note whose facts are malformed', () => {
    expect(noteRelated({ facts: 'x', links: ['esta://a'] })).toEqual({ facts: [], links: ['esta://a'] });
  });
});
