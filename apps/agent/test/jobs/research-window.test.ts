import { isoDate, type IsoDate } from '@esta/core';
import { addDays } from '@esta/core/date/calendar';
import { formatDate } from '@esta/core/format';
import { PUBLISHED_LABEL } from '@esta/core/parse/page-dates';
import { describe, expect, it } from 'vitest';
import { item, scan } from '../research-seed';

const ARTICLE = 'https://tintuc.example.vn/cua-so';
const WINDOW = /^Keep only news published on or after (\S+), or news of a rule that takes effect from (\S+) to (\S+)\./mu;

/** What `add_research_item` answers, in the scan the prompt was written for, for an article published and taking effect on these days. */
async function verdict(lastSuccessOn: IsoDate | null, publishedOn: IsoDate, effectiveOn: IsoDate | null = null) {
  const page = [`${PUBLISHED_LABEL}: ${formatDate(publishedOn, 'vi')}`, `Vành đai 3 đoạn qua Dĩ An có quy định mới${effectiveOn === null ? '' : `, hiệu lực từ ${formatDate(effectiveOn, 'vi')}`}.`].join('\n');
  const { call, prepared } = await scan({ pages: { [ARTICLE]: page }, overrides: { lastSuccessOn } });
  const reply = JSON.parse((await call('add_research_item', item({ source_url: ARTICLE, published_on: publishedOn, effective_on: effectiveOn }))).text) as { saved: boolean; dropped?: string };
  return { prompt: prepared.prompt, kept: reply.saved ? 'kept' : reply.dropped };
}

describe('the scan prompt states the window add_research_item keeps (#523)', () => {
  it.each([
    { run: 'the first run', lastSuccessOn: null, newSince: '2026-09-30' },
    { run: 'a run after one on 2026-10-06', lastSuccessOn: isoDate('2026-10-06'), newSince: '2026-10-06' },
  ])('on $run, names $newSince as the first day kept, and the keep rule keeps that day and drops the day before', async ({ lastSuccessOn, newSince }) => {
    const { prompt, kept } = await verdict(lastSuccessOn, isoDate(newSince));
    const [, start, today, effectiveBy] = WINDOW.exec(prompt) ?? [];
    expect([start, today, effectiveBy]).toEqual([newSince, '2026-10-07', '2026-12-06']);
    expect(prompt).toContain(`Skip a result whose date is before ${newSince} without fetching it`);
    expect(kept).toBe('kept');
    expect((await verdict(lastSuccessOn, addDays(isoDate(newSince), -1))).kept).toBe('seen_before');
  });

  it('keeps an older article about a rule taking effect on the last day the prompt names, and drops one a day later', async () => {
    const old = isoDate('2026-09-01');
    const { prompt, kept } = await verdict(null, old, isoDate('2026-12-06'));
    expect(WINDOW.exec(prompt)?.[3]).toBe('2026-12-06');
    expect(kept).toBe('kept');
    expect((await verdict(null, old, isoDate('2026-12-07'))).kept).toBe('seen_before');
  });
});
