import type { PropertyFilters } from './filters';
import { describe, expect, it } from 'vitest';
import { emptyListKind } from './empty';

const none = { q: '', sort: 'name', view: 'list', status: null, kind: null, use: null, legal: null, owner: null, province: null } as PropertyFilters;

describe('emptyListKind', () => {
  it('names a search first', () => {
    expect(emptyListKind({ ...none, q: 'bao loc', status: 'attention' }, 0)).toBe('search');
  });

  it('is the all-clear only on the attention tab alone, with the bills known', () => {
    expect(emptyListKind({ ...none, status: 'attention' }, 0)).toBe('allClear');
    expect(emptyListKind({ ...none, status: 'attention', kind: 'warehouse' }, 0)).toBe('filters');
    expect(emptyListKind({ ...none, status: 'vacant' }, 0)).toBe('filters');
  });

  it('never claims all clear when the bills could not be read', () => {
    expect(emptyListKind({ ...none, status: 'attention' }, null)).toBe('filters');
  });
});
