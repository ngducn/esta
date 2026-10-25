import { describe, expect, it } from 'vitest';
import { addDays } from '../date/calendar';
import { isoDate } from '../date/iso-date';
import { keepRule } from './keep-rule';

const today = isoDate('2026-10-07');
const days = (n: number) => addDays(today, n);

describe('keepRule (AGENT.md §5.2)', () => {
  it('keeps news from the last 7 days on the first run, and drops older news', () => {
    const first = { today, lastSuccessOn: null };
    expect(keepRule({ publishedOn: days(-7), effectiveOn: null }, first)).toEqual({ ok: true, value: 'new_since_last_run' });
    expect(keepRule({ publishedOn: days(-8), effectiveOn: null }, first)).toEqual({ ok: false, reason: 'seen_before' });
  });

  it('keeps news published since the last successful run, that day included', () => {
    const after = { today, lastSuccessOn: days(-1) };
    expect(keepRule({ publishedOn: days(-1), effectiveOn: null }, after).ok).toBe(true);
    expect(keepRule({ publishedOn: days(-2), effectiveOn: null }, after)).toEqual({ ok: false, reason: 'seen_before' });
  });

  it('keeps an older article about a rule effective in 59 or 60 days, not 61, and not one already in effect', () => {
    const after = { today, lastSuccessOn: days(-1) };
    const old = days(-30);
    expect(keepRule({ publishedOn: old, effectiveOn: days(59) }, after)).toEqual({ ok: true, value: 'effective_soon' });
    expect(keepRule({ publishedOn: old, effectiveOn: days(60) }, after).ok).toBe(true);
    expect(keepRule({ publishedOn: old, effectiveOn: days(61) }, after)).toEqual({ ok: false, reason: 'seen_before' });
    expect(keepRule({ publishedOn: old, effectiveOn: days(-1) }, after).ok).toBe(false);
  });

  it('drops an article dated after today', () => {
    expect(keepRule({ publishedOn: days(1), effectiveOn: days(10) }, { today, lastSuccessOn: null })).toEqual({ ok: false, reason: 'published_in_future' });
  });
});
