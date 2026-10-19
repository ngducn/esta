import { describe, expect, it } from 'vitest';
import { misses, PHASE_1_BUDGETS, PHASE_2_BUDGETS } from './phase-budget.ts';

const medians = { protocol: 'h2', route: '/properties', runs: 5, lcpMs: 2100, tbtMs: 120, cls: 0.01, scriptKb: 180, imageKb: 90 };
const [list, map, detail] = PHASE_1_BUDGETS;

describe('the Phase 1 Lighthouse budgets', () => {
  it('judge the map by the median of nine runs and keep the operator limits', () => {
    expect(map).toMatchObject({ runs: 9, limits: { tbtMs: 500 }, addedScriptKb: 300, pinsMs: 8000 });
    expect([list, detail].map((budget) => budget?.runs)).toEqual([undefined, undefined]);
  });

  it('cover the list, the map and a detail page', () => {
    expect(PHASE_1_BUDGETS.map((budget) => budget.route)).toEqual(['/properties', '/properties?view=map', expect.stringMatching(/^\/properties\/[0-9a-f-]{36}$/)]);
  });

  it('hold the list and the detail page to SPEC §7.2 and name each miss', () => {
    expect(list && misses(list, medians)).toEqual([]);
    expect(detail && misses(detail, { ...medians, lcpMs: 2600, cls: 0.06 })).toEqual(['lcpMs 2600 > 2500', 'cls 0.06 > 0.05']);
    expect(list && misses(list, { ...medians, tbtMs: 450, scriptKb: 280 })).toEqual(['tbtMs 450 > 200', 'scriptKb 280 > 200']);
  });

  it('give the map view its own budget: 300 KB of script over the list, TBT 500 ms and every pin within 8 s, with no LCP limit', () => {
    const map439 = { ...medians, lcpMs: 4000, tbtMs: 450, scriptKb: 439 };
    expect(map && misses(map, map439, { listScriptKb: 152, pinsMs: 3500 })).toEqual([]);
    expect(map && misses(map, { ...map439, tbtMs: 600, scriptKb: 460 }, { listScriptKb: 152, pinsMs: 8200 })).toEqual([
      'tbtMs 600 > 500',
      'addedScriptKb 308 > 300',
      'pinsMs 8200 > 8000',
    ]);
    expect(map && misses(map, map439)).toEqual(['addedScriptKb unknown > 300', 'pinsMs never > 8000']);
  });
});

describe('PHASE_2_BUDGETS', () => {
  it('holds /documents and the wizard to the general SPEC §7.2 budget', () => {
    expect(PHASE_2_BUDGETS).toEqual([
      { route: '/documents', limits: { lcpMs: 2500, tbtMs: 200, cls: 0.05, scriptKb: 200 } },
      { route: '/properties/new', limits: { lcpMs: 2500, tbtMs: 200, cls: 0.05, scriptKb: 200 } },
    ]);
  });
});
