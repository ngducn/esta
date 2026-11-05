import { describe, expect, it } from 'vitest';
import { isoDate } from '../date/iso-date';
import { groupActionFacts, MAX_GROUP_FACTS } from './group';
import type { WatchFact, WatchRuleId, WatchSeverity } from './types';

const DAY = isoDate('2026-11-06');
const fact = (ruleId: WatchRuleId, subject: string, severity: WatchSeverity = 'action'): WatchFact => ({ ruleId, subjectKey: `meter:${subject}`, severity, numbers: {} });
const entries = (facts: WatchFact[]) => facts.map((entry, index) => ({ handle: `f${index + 1}`, fact: entry }));

describe('groupActionFacts', () => {
  it('puts the action facts of one daily rule in one note keyed by the rule and the day, in handle order', () => {
    const groups = groupActionFacts(entries([fact('W8', 'a'), fact('W1', 'b'), fact('W8', 'c'), fact('W8', 'd')]), DAY);
    expect(groups).toEqual([
      { ruleId: 'W1', dedupeKey: 'watch:W1:group:2026-11-06', handles: ['f2'] },
      { ruleId: 'W8', dedupeKey: 'watch:W8:group:2026-11-06', handles: ['f1', 'f3', 'f4'] },
    ]);
  });

  it('keeps the same key however many facts the rule has, so a rerun the same day finds the note, and a later day starts a new one', () => {
    const two = groupActionFacts(entries([fact('W8', 'a'), fact('W8', 'b')]), DAY);
    const one = groupActionFacts(entries([fact('W8', 'a')]), DAY);
    expect(one[0]?.dedupeKey).toBe(two[0]?.dedupeKey);
    expect(groupActionFacts(entries([fact('W8', 'a'), fact('W8', 'b'), fact('W8', 'c')]), isoDate('2026-11-07'))[0]?.dedupeKey).not.toBe(two[0]?.dedupeKey);
  });

  it('leaves watch and info facts to the grouped note', () => {
    expect(groupActionFacts(entries([fact('W4', 'a', 'watch'), fact('W11', 'b', 'info')]), DAY)).toEqual([]);
  });

  it('keeps one note for each fact of a rule that repeats yearly, under the fact\'s own key', () => {
    const tax = (owner: string): WatchFact => ({ ruleId: 'W7', subjectKey: `owner:${owner}:2026`, severity: 'action', numbers: {} });
    expect(groupActionFacts(entries([tax('o1'), tax('o2')]), DAY).map(({ dedupeKey }) => dedupeKey)).toEqual(['watch:W7:owner:o1:2026:2026', 'watch:W7:owner:o2:2026:2026']);
  });

  it('continues a group past the most one note may relate in a second note', () => {
    const many = entries(Array.from({ length: MAX_GROUP_FACTS + 2 }, (_, index) => fact('W8', `m${index}`)));
    const groups = groupActionFacts(many, DAY);
    expect(groups.map(({ handles, dedupeKey }) => [handles.length, dedupeKey])).toEqual([[MAX_GROUP_FACTS, 'watch:W8:group:2026-11-06'], [2, 'watch:W8:group:2026-11-06:2']]);
  });
});
