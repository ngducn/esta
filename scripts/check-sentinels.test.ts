import { describe, expect, it } from 'vitest';
import { mappedIn, raisedSentinels, sentinelProblems } from './check-sentinels.ts';

const sql = ["raise exception 'ESTA_A' using errcode = '22023'; raise exception 'ESTA_B'", "else 'ESTA_C' end"];

describe('raisedSentinels', () => {
  it('lists each quoted sentinel once, in order', () => {
    expect(raisedSentinels([...sql, "'ESTA_A'"])).toEqual(['ESTA_A', 'ESTA_B', 'ESTA_C']);
  });
});

describe('mappedIn', () => {
  it('accepts a quoted literal or a table key, not a prefix or a comment-free mention of another name', () => {
    expect(mappedIn("{ ESTA_A: 'x' }", 'ESTA_A')).toBe(true);
    expect(mappedIn("error.message === 'ESTA_A'", 'ESTA_A')).toBe(true);
    expect(mappedIn("'ESTA_AB'", 'ESTA_A')).toBe(false);
    expect(mappedIn('// ESTA_A raised here', 'ESTA_A')).toBe(false);
  });
});

describe('sentinelProblems', () => {
  const raised = ['ESTA_A', 'ESTA_B', 'ESTA_C'];
  const sources = ["const R = { ESTA_A: 'a' };"];

  it('passes when each is mapped or listed with a reason', () => {
    expect(sentinelProblems(raised, sources, { ESTA_B: 'trigger', ESTA_C: 'guard' })).toEqual([]);
  });

  it('fails a new sentinel that is neither mapped nor listed', () => {
    expect(sentinelProblems(raised, sources, { ESTA_B: 'trigger' })).toEqual([expect.stringContaining('ESTA_C is raised by a migration')]);
  });

  it('fails a listed sentinel that is mapped now, so the list only shrinks', () => {
    expect(sentinelProblems(raised, sources, { ESTA_A: 'old', ESTA_B: 'trigger', ESTA_C: 'guard' })).toEqual([expect.stringContaining('ESTA_A is mapped')]);
  });

  it('fails a listed sentinel no migration raises, and a blank reason', () => {
    expect(sentinelProblems(raised, sources, { ESTA_B: ' ', ESTA_C: 'guard', ESTA_Z: 'gone' })).toEqual([
      expect.stringContaining('ESTA_Z is no longer raised'),
      expect.stringContaining('ESTA_B has no reason'),
    ]);
  });
});
