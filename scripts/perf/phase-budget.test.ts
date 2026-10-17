import { describe, expect, it } from 'vitest';
import { misses, PHASE_1_BUDGETS } from './phase-budget.ts';

const medians = { protocol: 'h2', route: '/properties', runs: 5, lcpMs: 2100, tbtMs: 120, cls: 0.01, scriptKb: 180, imageKb: 90 };
const [list, map] = PHASE_1_BUDGETS;

describe('the Phase 1 Lighthouse budgets', () => {
  it('cover the list, the map and a detail page', () => {
    expect(PHASE_1_BUDGETS.map((budget) => budget.route)).toEqual(['/properties', '/properties?view=map', expect.stringMatching(/^\/properties\/[0-9a-f-]{36}$/)]);
  });

  it('pass medians inside the budget and name each miss', () => {
    expect(list && misses(list, medians)).toEqual([]);
    expect(list && misses(list, { ...medians, lcpMs: 2600, cls: 0.06 })).toEqual(['lcpMs 2600 > 2500', 'cls 0.06 > 0.05']);
  });

  it('give the map view its own TBT and script budget', () => {
    expect(map && misses(map, { ...medians, tbtMs: 450, scriptKb: 280 })).toEqual([]);
    expect(list && misses(list, { ...medians, tbtMs: 450, scriptKb: 280 })).toEqual(['tbtMs 450 > 200', 'scriptKb 280 > 200']);
  });
});
