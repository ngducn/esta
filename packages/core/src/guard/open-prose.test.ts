import { describe, expect, it } from 'vitest';
import { OPEN_PROSE, OPEN_PROSE_SHEET } from './fixtures/open-prose';
import { checkNote } from './index';

describe('the guard on open advice and writing (AGENT.md §5.6 step 7)', () => {
  it('holds at least twenty Vietnamese and five English prompts', () => {
    expect(OPEN_PROSE.filter(({ id }) => id.startsWith('vi-')).length).toBeGreaterThanOrEqual(20);
    expect(OPEN_PROSE.filter(({ id }) => id.startsWith('en-')).length).toBeGreaterThanOrEqual(5);
  });

  it.each(OPEN_PROSE)('passes the $kind answer to $id', ({ template }) => {
    const checked = checkNote(template, OPEN_PROSE_SHEET);
    expect(checked.ok ? [] : checked.reason).toEqual([]);
  });
});
