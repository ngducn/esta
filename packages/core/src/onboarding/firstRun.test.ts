import { describe, expect, it } from 'vitest';
import { firstRunState, type FirstRunSnapshot } from './firstRun';

const empty: FirstRunSnapshot = { role: 'admin', propertyCount: 0, bankAccountCount: 0, memberCount: 1, dismissedAt: null };
const done = (state: ReturnType<typeof firstRunState>) => state.steps.filter((step) => step.done).map((step) => step.id);

describe('firstRunState', () => {
  it('shows all three steps undone for a new household', () => {
    const state = firstRunState(empty);
    expect(state.visible).toBe(true);
    expect(state.steps.map((step) => step.id)).toEqual(['add-property', 'add-bank-account', 'invite-member']);
    expect(done(state)).toEqual([]);
  });

  it.each([
    ['add-property', { propertyCount: 1 }],
    ['add-bank-account', { bankAccountCount: 1 }],
    ['invite-member', { memberCount: 2 }],
  ])('marks only %s done', (id, patch) => {
    const state = firstRunState({ ...empty, ...patch });
    expect(done(state)).toEqual([id]);
    expect(state.visible).toBe(true);
  });

  it('hides itself once every step is done, keeping the done flags', () => {
    const state = firstRunState({ ...empty, propertyCount: 3, bankAccountCount: 1, memberCount: 2 });
    expect(state.visible).toBe(false);
    expect(done(state)).toHaveLength(3);
  });

  it('hides itself once dismissed, even with steps left', () => {
    const state = firstRunState({ ...empty, dismissedAt: '2026-11-06T09:00:00+07:00' });
    expect(state.visible).toBe(false);
    expect(done(state)).toEqual([]);
  });

  it.each(['member', 'viewer'] as const)('is never shown to a %s', (role) => {
    expect(firstRunState({ ...empty, role }).visible).toBe(false);
  });
});
