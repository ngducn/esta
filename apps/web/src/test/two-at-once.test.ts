import { describe, expect, it } from 'vitest';
import { twoAtOnce } from './two-at-once';

describe('twoAtOnce', () => {
  it('starts both calls before either settles', async () => {
    let running = 0;
    let peak = 0;
    const [first, second] = await twoAtOnce(async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
      return 'done';
    });
    expect(peak).toBe(2);
    expect([first, second]).toEqual([
      { status: 'fulfilled', value: 'done' },
      { status: 'fulfilled', value: 'done' },
    ]);
  });

  it('returns a refusal as an outcome instead of throwing', async () => {
    let calls = 0;
    const outcomes = await twoAtOnce(async () => {
      calls += 1;
      if (calls === 2) throw new Error('second refused');
      return calls;
    });
    expect(outcomes[0]).toEqual({ status: 'fulfilled', value: 1 });
    expect(outcomes[1]).toMatchObject({ status: 'rejected', reason: new Error('second refused') });
  });
});
